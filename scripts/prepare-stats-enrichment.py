"""Join explicit counters only. Missing rankings/CSV cells stay unknown, not zero."""
import collections
import csv
import datetime as dt
import hashlib
import importlib.util
import json
import re
import subprocess
import unicodedata
from pathlib import Path
from urllib.parse import unquote, urlparse, parse_qs

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND / 'data/stats-enrichment'
FIELDS = ['tacklesWon', 'interceptions', 'keyPasses', 'passesCompleted', 'passesAttempted']
BASE = ['appearances', 'minutesPlayed', 'goals', 'assists', 'yellowCards', 'redCards']
_spec = importlib.util.spec_from_file_location('footballtoday_reader', BACKEND / 'scripts/fetch-footballtoday-stats.py')
_reader = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_reader)
LEAGUES = {'TR1': 'Süper Lig', 'PO1': 'Primeira Liga', 'NL1': 'Eredivisie', 'GB1': 'Premier League',
           'ES1': 'La Liga', 'L1': 'Bundesliga', 'IT1': 'Serie A', 'FR1': 'Ligue 1'}
SS_LEAGUES = {'ENG-Premier League': 'GB1', 'ESP-La Liga': 'ES1', 'ITA-Serie A': 'IT1',
              'GER-Bundesliga': 'L1', 'FRA-Ligue 1': 'FR1'}
REFERENCES = [
    ('reep-people.csv', 'https://raw.githubusercontent.com/withqwerty/reep/0ec59faa5d81615b7a8200ae6121023a3bc14ce3/data/people.csv',
     '9c3c1eb59ab149dfd45ba43eceafd8f71820aad0451adee8be9d2d9e279adf7e'),
    ('primeira-2526.csv', 'https://raw.githubusercontent.com/jczpineda/Forensics-xG-Intelligence-Unit-/8cb0f85be1eafeb25bc228ed5eb2d724ebc80b10/Primeira%20Liga/jugadores_seasonstats.csv',
     'd950c8dd1b8554a7d7aa614564c78df0ab6610b2ea30446aaca16ea9edca4240'),
]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def key(text):
    text = unquote(text).translate(str.maketrans({'ı': 'i', 'đ': 'd', 'Đ': 'D', 'ł': 'l', 'ø': 'o'}))
    return ''.join(c for c in unicodedata.normalize('NFKD', text).casefold() if c.isalnum())


def counter(value):
    if value is None or value == '':
        return None
    if not re.fullmatch(r'\d+(?:\.0+)?', str(value)):
        raise ValueError('Invalid counter: ' + repr(value))
    result = int(float(value))
    if result > 2147483647:
        raise ValueError('Counter overflow')
    return result


def baseline_matches(source, expected):
    if source.get('appearances') != expected['appearances'] or expected['minutesPlayed'] <= 0:
        return False
    minutes = source.get('minutesPlayed')
    if minutes is None or minutes <= 0 or abs(minutes - expected['minutesPlayed']) > min(expected['appearances'], expected['minutesPlayed'] // 100):
        return False
    # Unavailable goals are not silently zero. ID/name+club, appearances and minutes remain mandatory.
    return source.get('goals') is None or source['goals'] == expected['goals']


def establish_clubs(candidates, tm, clubs):
    votes = collections.defaultdict(lambda: collections.defaultdict(set))
    for row in candidates:
        entry = tm[row['tmId']]
        memberships = entry['provenance']['clubsDuringSeason']
        if len(memberships) == 1 and clubs[memberships[0]]['league'] == LEAGUES[row['league']]:
            votes[(row['provider'], row['league'], row['team'])][memberships[0]].add(row['tmId'])
    mappings, evidence = {}, []
    for group, options in sorted(votes.items()):
        if len(options) != 1:
            continue
        cid, players = next(iter(options.items()))
        if len(players) >= 3:
            mappings[group] = cid
            evidence.append({'provider': group[0], 'league': group[1], 'team': group[2],
                             'transfermarktClubId': cid, 'anchorIds': sorted(players)})
    return mappings, evidence


def prepare():
    ROOT.mkdir(parents=True, exist_ok=True)
    tm_bytes = (BACKEND / 'data/transfermarkt/prepared.json').read_bytes()
    bundle = json.loads(tm_bytes)
    assert bundle['provider'] == 'https://github.com/dcaribou/transfermarkt-datasets' and bundle['season'] == '2025/2026'
    tm = {str(e['player']['transfermarktId']): e for e in bundle['players']}
    clubs = {str(c['transfermarktId']): c for c in bundle['clubs']}
    sources = [{'file': 'data/transfermarkt/prepared.json', 'sha256': sha(tm_bytes)}]
    for name, url, expected in (REFERENCES if 'PO1' in _reader.LEAGUES else REFERENCES[:1]):
        dest = ROOT / 'reference' / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        if not dest.exists():
            subprocess.run(['curl', '--fail', '--location', '--silent', '--show-error', '--max-time', '60', url, '--output', str(dest)], check=True)
        assert sha(dest.read_bytes()) == expected, 'Reference checksum changed: ' + name
        sources.append({'file': str(dest.relative_to(BACKEND)), 'url': url, 'sha256': expected})
    names = collections.defaultdict(set)
    for tid, e in tm.items():
        names[key(e['player']['name'])].add(tid)
    bridges = {'key_sofascore': collections.defaultdict(set), 'key_opta': collections.defaultdict(set)}
    for r in csv.DictReader((ROOT / 'reference/reep-people.csv').open()):
        tid = r['key_transfermarkt']
        if r['type'] != 'player' or tid not in tm or r['date_of_birth'] != tm[tid]['player']['dateOfBirth']:
            continue
        for name in [r['name'], r['full_name']]:
            if name:
                names[key(name)].add(tid)
        for field, index in bridges.items():
            if r[field]:
                index[r[field]].add(tid)
    candidates, rejected = [], collections.Counter()
    # Public player profiles can establish aliases missing from REEP. The source
    # birth date is reparsed here; a hand-edited mapping alone is never evidence.
    identity_evidence = {}
    identities_file = ROOT / 'verified-identities.json'
    if identities_file.exists():
        identity_spec = importlib.util.spec_from_file_location('ft_identities', BACKEND / 'scripts/fetch-footballtoday-identities.py')
        identity_reader = importlib.util.module_from_spec(identity_spec)
        identity_spec.loader.exec_module(identity_reader)
        for row in json.loads(identities_file.read_text()):
            tid = str(row['transfermarktId'])
            if tid not in tm:
                continue  # Identity evidence retained from the archived eight-league scope.
            proof = row['source']
            assert proof['url'] == _reader.HOST + row['slug'] and row['slug'].startswith('/player/')
            raw = ROOT / 'footballtoday' / proof['file']
            assert sha(raw.read_bytes()) == proof['sha256']
            people = identity_reader.persons(raw.read_text())
            assert len(people) == 1 and people[0].get('birthDate', '')[:10] == tm[tid]['player']['dateOfBirth']
            assert people[0].get('mainEntityOfPage') == proof['url']
            alias = key(row['slug'].removeprefix('/player/'))
            names[alias].add(tid)
            identity_evidence[(row['league'], row['teamId'], row['slug'])] = {
                'bridge': 'PUBLIC_PROFILE_DOB_CLUB_BASELINE', 'transfermarktId': int(tid),
                'sourceDateOfBirth': people[0]['birthDate'][:10], **proof}
            sources.append({'file': str(raw.relative_to(BACKEND)), 'sha256': proof['sha256'], 'url': proof['url']})

    def add(tid, league, team, data, baseline, provider, provenance):
        if tid not in tm or not baseline_matches(baseline, tm[tid]['stats']):
            rejected['identity_or_baseline'] += 1
            return
        memberships = tm[tid]['provenance']['clubsDuringSeason']
        # Team-filtered tables and Opta files may be partial for transfers. Never sum/infer missing stints.
        if len(memberships) != 1 or clubs[memberships[0]]['league'] != LEAGUES[league]:
            rejected['multi_club_or_other_league'] += 1
            return
        if data.get('passesCompleted') is not None and data.get('passesAttempted') is not None and data['passesCompleted'] > data['passesAttempted']:
            rejected['invalid_pass_pair'] += 1
            return
        if not any(data.get(f) is not None for f in FIELDS):
            return
        candidates.append({'tmId': tid, 'league': league, 'team': team, 'data': data, 'baseline': baseline,
                           'provider': provider, 'provenance': provenance})

    # Original SofaScore table: same counters/guard, additional REEP ID+DOB bridge for aliases.
    ss_file = BACKEND / 'data/supplemental-stats/raw/sofascore_player_seasons.csv'
    ss_sha = sha(ss_file.read_bytes())
    assert ss_sha == 'acf7b7aa303c8de040de30ad2f367ea7c30b61e75d6d10dac2611f36963bbcc6'
    sources.append({'file': str(ss_file.relative_to(BACKEND)), 'sha256': ss_sha})
    for row_number, r in enumerate(csv.DictReader(ss_file.open()), 2):
        if r['season'] != '2526' or r['league'] not in SS_LEAGUES:
            continue
        matches = bridges['key_sofascore'].get(r['player_id']) or names.get(key(r['player']), set())
        if len(matches) != 1:
            continue
        mapping = {'tacklesWon': 'tacklesWon', 'interceptions': 'interceptions', 'keyPasses': 'keyPasses',
                   'passesCompleted': 'accuratePasses', 'passesAttempted': 'totalPasses'}
        add(next(iter(matches)), SS_LEAGUES[r['league']], key(r['team']), {f: counter(r[s]) for f, s in mapping.items()},
            {f: counter(r[f]) for f in ['appearances', 'minutesPlayed', 'goals']}, 'SofaScoreSnapshot',
            {'sourceFile': str(ss_file.relative_to(BACKEND)), 'sha256': ss_sha, 'sourcePlayerId': r['player_id'], 'row': row_number,
             'bridge': 'REEP_ID_DOB' if bridges['key_sofascore'].get(r['player_id']) else 'UNIQUE_FULL_NAME'})

    # Rankings: cache contains the site's explicit integer totals, not the rounded per-match column.
    for file in sorted((ROOT / 'footballtoday').glob('*.json')):
        snapshot = json.loads(file.read_text())
        league = snapshot['league']
        if league not in _reader.LEAGUES:
            continue  # Archived caches of leagues removed from the active dataset.
        assert snapshot['season'] == '2025/2026' and league in LEAGUES
        league_proof = snapshot['leagueSource']
        league_raw = ROOT / 'footballtoday' / league_proof['file']
        assert sha(league_raw.read_bytes()) == league_proof['sha256']
        assert league_proof['url'] == _reader.HOST + '/' + _reader.LEAGUES[league][0] + '/2025-2026'
        league_page = _reader.Page(league_raw.read_text())
        tournament_ids = {re.search(r'/players-standings/(\d+)', a['data-api']).group(1)
                          for a in league_page.attrs if '/players-standings/' in a['data-api']}
        assert tournament_ids == {snapshot['tournamentId']}
        sources.append({'file': str(league_raw.relative_to(BACKEND)), **{k: league_proof[k] for k in ['sha256', 'url']}})
        combined, proofs = collections.defaultdict(dict), collections.defaultdict(dict)
        for table in snapshot['tables']:
            evidence = table['source']
            source_url = urlparse(evidence['url'])
            query = parse_qs(source_url.query)
            assert source_url.scheme == 'https' and source_url.netloc == 'www.footballtoday.net'
            assert source_url.path == '/api/tournament-stat/players-standings/' + snapshot['tournamentId']
            assert query.get('team') == [table['teamId']]
            assert _reader.FIELDS[query['typeCode'][0]] == table['field']
            assert table['teamId'] in {t['teamId'] for t in snapshot['teams']}
            raw = ROOT / 'footballtoday' / evidence['file']
            assert sha(raw.read_bytes()) == evidence['sha256']
            # Verify the cached parsed totals against the original HTML, not just a prepared JSON value.
            parsed = []
            for line in _reader.Page(raw.read_text()).rows:
                links = [h for h in line['links'] if h.startswith('/player/')]
                if len(links) == 1:
                    parsed.append({'slug': links[0], 'displayName': line['cells'][1], 'value': counter(line['cells'][-1])})
            assert parsed == table['rows'], 'Parsed totals differ from source HTML'
            sources.append({'file': str(raw.relative_to(BACKEND)), 'sha256': evidence['sha256'], 'url': evidence['url']})
            for r in table['rows']:
                k = (table['teamId'], r['slug'])
                assert table['field'] not in combined[k], 'Duplicate source stat'
                combined[k][table['field']] = counter(r['value'])
                proofs[k][table['field']] = evidence
        for (team, slug), stats in combined.items():
            matches = names.get(key(slug.removeprefix('/player/')), set())
            if len(matches) != 1:
                continue
            add(next(iter(matches)), league, team, {f: stats.get(f) for f in FIELDS},
                {f: stats.get(f) for f in ['appearances', 'minutesPlayed', 'goals']}, 'FootballToday',
                {'playerUrl': 'https://www.footballtoday.net' + slug, 'tournamentId': snapshot['tournamentId'],
                 'identityEvidence': identity_evidence.get((league, team, slug)), 'fieldSources': proofs[(team, slug)]})

    # Portugal raw Opta snapshot. Blank cells remain None. NL snapshot is excluded: last round not established.
    f = ROOT / 'reference/primeira-2526.csv'
    opta_rows = list(csv.DictReader(f.open(encoding='utf-8-sig'))) if 'PO1' in _reader.LEAGUES else []
    multiplicity = collections.Counter(r['id'] for r in opta_rows if r['temporada'] == '2025-2026')
    for number, r in enumerate(opta_rows, 2):
        matches = bridges['key_opta'].get(r['id'], set())
        if r['temporada'] != '2025-2026' or len(matches) != 1 or multiplicity[r['id']] != 1:
            continue
        mapping = {'tacklesWon': 'Tackles Won', 'interceptions': 'Interceptions', 'keyPasses': 'Key Passes (Attempt Assists)',
                   'passesCompleted': 'Total Successful Passes ( Excl Crosses & Corners ) ', 'passesAttempted': 'Total Passes'}
        add(next(iter(matches)), 'PO1', key(r['equipo']), {field: counter(r[col]) for field, col in mapping.items()},
            {'appearances': counter(r['Appearances']), 'minutesPlayed': counter(r['Time Played']), 'goals': counter(r['Goals'])},
            'ForensicsOptaSnapshot', {'sourceFile': str(f.relative_to(BACKEND)), 'sha256': REFERENCES[1][2], 'row': number,
                                      'sourcePlayerId': r['id'], 'bridge': 'REEP_ID_DOB'})

    mappings, club_evidence = establish_clubs(candidates, tm, clubs)
    selected = {}
    by_provider = collections.Counter()
    for r in candidates:
        memberships = tm[r['tmId']]['provenance']['clubsDuringSeason']
        if mappings.get((r['provider'], r['league'], r['team'])) not in memberships:
            rejected['unconfirmed_club'] += 1
            continue
        e = tm[r['tmId']]
        target = selected.setdefault(r['tmId'], {'transfermarktId': int(r['tmId']), 'name': e['player']['name'],
            'dateOfBirth': e['player']['dateOfBirth'], 'season': '2025/2026', 'league': r['league'],
            'expectedBaseline': {k: e['stats'][k] for k in BASE}, 'data': {}, 'evidence': {}})
        proof = {'provider': r['provider'], 'league': r['league'], 'sourceBaseline': r['baseline'],
                 'minutesDifference': r['baseline']['minutesPlayed'] - e['stats']['minutesPlayed'], 'reliability': 'UNKNOWN',
                 'team': r['team'], 'transfermarktClubId': memberships[0], **r['provenance']}
        for field in FIELDS[:3]:
            if field not in target['data'] and r['data'].get(field) is not None:
                target['data'][field] = r['data'][field]
                target['evidence'][field] = proof
                by_provider[r['provider']] += 1
        # Keep the passing numerator/denominator from ONE candidate; no cross-provider ratio invention.
        if sum(f in target['data'] for f in FIELDS[3:]) < sum(r['data'].get(f) is not None for f in FIELDS[3:]):
            for field in FIELDS[3:]:
                target['data'].pop(field, None)
                target['evidence'].pop(field, None)
            for field in FIELDS[3:]:
                if r['data'].get(field) is not None:
                    target['data'][field] = r['data'][field]
                    target['evidence'][field] = proof
                    by_provider[r['provider']] += 1
    sources = list({s['file']: s for s in sources}.values())
    by_provider = collections.Counter(p['provider'] for e in selected.values() for p in e['evidence'].values())
    result = {'pipeline': 'STATS_ENRICHMENT_V1', 'season': '2025/2026', 'preparedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
              'policy': 'Unique provider ID+DOB or unique full name; unanimous >=3 club anchors; same league, single club; exact appearances, minutes within min(appearances, floor(1% minutes)); check goals when available; NULL-only fill.',
              'sources': sources, 'entries': list(selected.values()), 'clubEvidence': club_evidence,
              'counts': {'candidateRows': len(candidates), 'playersPrepared': len(selected), 'fieldsByProvider': dict(by_provider), 'rejected': dict(rejected)}}
    (ROOT / 'prepared.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result['counts'], indent=2))


if __name__ == '__main__':
    prepare()
