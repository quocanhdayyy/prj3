"""Cache public 2025/26 team-filtered stat tables. No login, scraping bypass or inferred zeros."""
import concurrent.futures
import datetime as dt
import hashlib
import json
import re
import subprocess
import time
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

ROOT = Path(__file__).resolve().parents[1] / 'data/stats-enrichment/footballtoday'
HOST = 'https://www.footballtoday.net'
LEAGUES = {
    'GB1': ('england/premier-league', 20),
    'ES1': ('spain/primera-division', 20), 'L1': ('germany/bundesliga', 18),
    'IT1': ('italy/serie-a', 20), 'FR1': ('france/ligue-1', 18),
}
FIELDS = {'tackles won': 'tacklesWon', 'interceptions': 'interceptions', 'key passes (attempt assists)': 'keyPasses',
          'total successful passes (excl crosses & corners)': 'passesCompleted', 'total passes': 'passesAttempted',
          'games played': 'appearances', 'time played': 'minutesPlayed', 'goals': 'goals'}


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.tables, self.table, self.row, self.cell = [], None, None, None
        self.attrs, self.rows = [], []
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if d.get('data-api'):
            self.attrs.append(d)
        if tag == 'table':
            self.table = []
        if tag == 'tr':
            self.row = {'cells': [], 'links': []}
        if tag in ['td', 'th'] and self.row is not None:
            self.cell = []
        if tag == 'a' and self.row is not None and d.get('href'):
            self.row['links'].append(d['href'])

    def handle_data(self, value):
        if self.cell is not None and value.strip():
            self.cell.append(value.strip())

    def handle_endtag(self, tag):
        if tag in ['td', 'th'] and self.cell is not None:
            self.row['cells'].append(' '.join(self.cell))
            self.cell = None
        if tag == 'tr' and self.row is not None:
            self.rows.append(self.row)
            if self.table is not None:
                self.table.append(self.row)
            self.row = None
        if tag == 'table' and self.table is not None:
            self.tables.append(self.table)
            self.table = None


def fetch(url):
    assert url.startswith(HOST + '/')
    ROOT.mkdir(parents=True, exist_ok=True)
    target = ROOT / (hashlib.sha256(url.encode()).hexdigest() + '.html')
    if not target.exists():
        result = subprocess.run(['curl', '--fail', '--location', '--silent', '--show-error', '--max-time', '25', url,
                                 '--output', str(target.with_suffix('.download'))], capture_output=True, text=True)
        if result.returncode:
            target.with_suffix('.download').unlink(missing_ok=True)
            raise RuntimeError(url + ': ' + result.stderr.strip())
        target.with_suffix('.download').replace(target)
        time.sleep(0.3)
    data = target.read_bytes()
    return Page(data.decode()), {'url': url, 'file': target.name, 'sha256': hashlib.sha256(data).hexdigest()}


def collect(code, route, team_count):
    page, league_source = fetch(f'{HOST}/{route}/2025-2026')
    tables = [list(dict.fromkeys(h for r in t for h in r['links'] if h.startswith('/team/'))) for t in page.tables]
    teams = next((t for t in tables if len(t) == team_count), None)
    tournaments = {re.search(r'/players-standings/(\d+)', a['data-api']).group(1)
                   for a in page.attrs if '/players-standings/' in a['data-api']}
    if not teams or len(tournaments) != 1:
        raise ValueError('Unexpected season/teams/tournament: ' + code)
    tournament = next(iter(tournaments))

    def metadata(href):
        p, source = fetch(HOST + href)
        ids = set()
        for a in p.attrs:
            if '/players-standings/' in a['data-api']:
                ids.update(parse_qs(urlparse(a['data-api']).query).get('team', []))
            team_path = re.match(r'/api/team/(\d+)/(?:matches|transfers)(?:\?|$)', a['data-api'])
            if team_path:
                ids.add(team_path.group(1))
        if len(ids) != 1:
            raise ValueError('Ambiguous team ID: ' + href)
        return {'teamUrl': HOST + href, 'teamId': ids.pop(), 'source': source}

    def read_table(job):
        team, stat, field = job
        url = f'{HOST}/api/tournament-stat/players-standings/{tournament}?typeCode={quote(stat, safe="")}&team={team["teamId"]}'
        p, source = fetch(url)
        rows = []
        for row in p.rows:
            links = [h for h in row['links'] if h.startswith('/player/')]
            if len(links) != 1:
                continue
            cells = row['cells']
            if len(cells) not in [3, 4] or not re.fullmatch(r'\d+', cells[-1]):
                raise ValueError('Unexpected numeric table: ' + url)
            rows.append({'slug': links[0], 'displayName': cells[1], 'value': int(cells[-1])})
        return {'teamId': team['teamId'], 'teamUrl': team['teamUrl'], 'field': field, 'source': source, 'rows': rows}

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        metadata_rows = list(pool.map(metadata, teams))
        jobs = [(t, s, f) for t in metadata_rows for s, f in FIELDS.items()]
        stat_tables = []
        for table in pool.map(read_table, jobs):
            stat_tables.append(table)
            if len(stat_tables) % 48 == 0:
                print(json.dumps({'league': code, 'tables': len(stat_tables), 'expected': len(jobs)}), flush=True)
    result = {'league': code, 'season': '2025/2026', 'leagueSource': league_source, 'tournamentId': tournament,
              'downloadedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'teams': metadata_rows, 'tables': stat_tables,
              'limitation': 'Public ranking tables return at most 25 players. Omitted entries are unknown, never zero.'}
    (ROOT / (code + '.json')).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'league': code, 'complete': True, 'teams': len(teams), 'tables': len(stat_tables)}), flush=True)


if __name__ == '__main__':
    for code, (route, count) in LEAGUES.items():
        if (ROOT / (code + '.json')).exists():
            print(json.dumps({'league': code, 'cached': True}), flush=True)
            continue
        collect(code, route, count)
