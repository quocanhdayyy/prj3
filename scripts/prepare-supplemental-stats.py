"""Prepare a conservative, reproducible join; never run publisher code or guess missing stats."""
import argparse
import collections
import csv
import datetime as dt
import hashlib
import json
import math
import re
import subprocess
import unicodedata
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND / 'data/supplemental-stats'
COMMIT = '8940299c2c56c2c0932d3caf292336f5e1689893'
PROVIDER = 'https://github.com/m-mahadi/top5-football-dataset'
URL = f'https://raw.githubusercontent.com/m-mahadi/top5-football-dataset/{COMMIT}/data/clean/sofascore_player_seasons.csv'
SHA256 = 'acf7b7aa303c8de040de30ad2f367ea7c30b61e75d6d10dac2611f36963bbcc6'
POLICY = 'EXACT_NAME_CLUB_COUNTS_MINUTES_V1'
LEAGUES = {
    'ENG-Premier League': ('Premier League', 17, 76986),
    'ESP-La Liga': ('La Liga', 8, 77559),
    'ITA-Serie A': ('Serie A', 23, 76457),
    'GER-Bundesliga': ('Bundesliga', 35, 77333),
    'FRA-Ligue 1': ('Ligue 1', 34, 77356),
}
FIELDS = {'tacklesWon': 'tacklesWon', 'interceptions': 'interceptions', 'keyPasses': 'keyPasses',
          'accuratePasses': 'passesCompleted', 'totalPasses': 'passesAttempted'}
BASE_FIELDS = ['appearances', 'minutesPlayed', 'goals', 'assists', 'yellowCards', 'redCards']


def digest(data):
    return hashlib.sha256(data).hexdigest()


def name_key(value):
    # Exact full names after accents/punctuation/case only. No initials, surname or fuzzy joins.
    return ''.join(c for c in unicodedata.normalize('NFKD', value).casefold() if c.isalnum())


def integer(value):
    if not re.fullmatch(r'\d+(?:\.0+)?', str(value)):
        raise ValueError('Missing or non-integer counter: ' + repr(value))
    number = int(float(value))
    if number > 2147483647:
        raise ValueError('Counter overflows database integer')
    return number


def match_rows(rows, bundle):
    if bundle['provider'] != 'https://github.com/dcaribou/transfermarkt-datasets' or bundle['season'] != '2025/2026':
        raise ValueError('Unexpected Transfermarkt scope')
    index = collections.defaultdict(list)
    clubs = {str(c['transfermarktId']): c for c in bundle['clubs']}
    for entry in bundle['players']:
        index[name_key(entry['player']['name'])].append(entry)
    seen, reviews, candidates = set(), [], []
    counts = collections.Counter()
    for row_number, row in enumerate(rows, 2):
        if row['season'] != '2526' or row['league'] not in LEAGUES:
            continue
        counts['selectedSourceRows'] += 1
        pid = integer(row['player_id'])
        key = (row['league'], pid)
        if key in seen:
            raise ValueError('Duplicate player/league/season source row: ' + repr(key))
        seen.add(key)
        league, tournament, season_id = LEAGUES[row['league']]
        if integer(row['tourn_id']) != tournament or integer(row['season_id']) != season_id or row['type'] != 'overall':
            raise ValueError('Unexpected tournament/season/aggregation')
        review = {'row': row_number, 'sourcePlayerId': pid, 'sourceName': row['player'],
                  'sourceTeam': row['team'], 'league': row['league']}
        def skip(reason):
            counts[reason] += 1
            reviews.append({**review, 'reason': reason})
        matches = index.get(name_key(row['player']), [])
        if len(matches) != 1:
            skip('ambiguous_or_missing_full_name')
            continue
        entry = matches[0]
        stats = entry['stats']
        try:
            source_stats = {k: integer(row[k]) for k in [*FIELDS, 'appearances', 'minutesPlayed', 'goals']}
            if source_stats['accuratePasses'] > source_stats['totalPasses']:
                raise ValueError('Completed passes exceed attempts')
        except ValueError:
            skip('invalid_or_missing_statistics')
            continue
        if source_stats['appearances'] != stats['appearances'] or source_stats['goals'] != stats['goals']:
            skip('appearances_or_goals_differ')
            continue
        # A conservative acceptance guard, NOT a claim that rounding explains every discrepancy.
        # Retain Transfermarkt minutes. Both <= 1 minute/appearance AND <= 1% season minutes.
        allowed = min(stats['appearances'], math.floor(stats['minutesPlayed'] / 100))
        delta = source_stats['minutesPlayed'] - stats['minutesPlayed']
        if stats['minutesPlayed'] <= 0 or source_stats['minutesPlayed'] <= 0 or abs(delta) > allowed:
            skip('minutes_differ_beyond_tolerance')
            continue
        memberships = entry['provenance']['clubsDuringSeason']
        if not memberships or any(c not in clubs or clubs[c]['league'] != league for c in memberships):
            # Never append partial one-league stats to a multi-league season total.
            skip('cross_league_or_unknown_scope')
            continue
        candidates.append((row, entry, source_stats, review, delta, allowed))
    # Infer a club alias only from >=3 distinct, exact-name single-club players, unanimous.
    # A lone player cannot establish his own club mapping.
    votes = collections.defaultdict(lambda: collections.defaultdict(set))
    for row, entry, _, _, _, _ in candidates:
        memberships = entry['provenance']['clubsDuringSeason']
        if len(memberships) == 1:
            votes[(row['league'], name_key(row['team']))][memberships[0]].add(entry['player']['transfermarktId'])
    club_map, evidence = {}, []
    for key, options in sorted(votes.items()):
        if len(options) == 1:
            cid, anchors = next(iter(options.items()))
            if len(anchors) >= 3:
                club_map[key] = cid
                evidence.append({'league': key[0], 'sourceTeamKey': key[1], 'transfermarktClubId': int(cid),
                                 'localClubName': clubs[cid]['name'], 'anchorPlayerIds': sorted(anchors)})
    accepted, target_ids = [], set()
    for row, entry, source_stats, review, delta, allowed in candidates:
        cid = club_map.get((row['league'], name_key(row['team'])))
        if cid not in entry['provenance']['clubsDuringSeason']:
            counts['unconfirmed_club'] += 1
            reviews.append({**review, 'reason': 'unconfirmed_club'})
            continue
        target = entry['player']['transfermarktId']
        if target in target_ids:
            raise ValueError('Multiple source rows target the same local season; review required')
        target_ids.add(target)
        accepted.append({'transfermarktId': target, 'name': entry['player']['name'],
                         'dateOfBirth': entry['player']['dateOfBirth'], 'season': bundle['season'],
                         'expectedBaseline': {k: entry['stats'][k] for k in BASE_FIELDS},
                         'statistics': {target: source_stats[source] for source, target in FIELDS.items()},
                         'provenance': {**review, 'sourceTournamentId': integer(row['tourn_id']),
                                        'sourceSeasonId': integer(row['season_id']), 'transfermarktClubId': int(cid),
                                        'sourceMinutesPlayed': source_stats['minutesPlayed'],
                                        'retainedMinutesPlayed': entry['stats']['minutesPlayed'],
                                        'minutesDifference': delta, 'allowedMinutesDifference': allowed,
                                        'sourceAppearances': source_stats['appearances'], 'sourceGoals': source_stats['goals']}})
    counts['acceptedRows'] = len(accepted)
    counts['rowsWithMinorMinuteDifference'] = sum(e['provenance']['minutesDifference'] != 0 for e in accepted)
    return {'provider': PROVIDER, 'upstream': 'SofaScore season statistics via third-party snapshot',
            'reliability': 'UNKNOWN', 'commit': COMMIT, 'sourceUrl': URL, 'sourceSha256': SHA256,
            'season': bundle['season'], 'matchingPolicy': POLICY,
            'minutesPolicy': 'Keep Transfermarkt minutes; exact appearances/goals, absolute difference <= appearances AND <= floor(1% of minutes). No rescaling.',
            'fields': list(FIELDS.values()), 'entries': accepted, 'clubEvidence': evidence,
            'counts': dict(counts), 'review': reviews}


def prepare(root=ROOT):
    root.mkdir(parents=True, exist_ok=True)
    source = root / 'raw/sofascore_player_seasons.csv'
    source.parent.mkdir(parents=True, exist_ok=True)
    if not source.exists():
        temporary = source.with_suffix('.download')
        subprocess.run(['curl', '--fail', '--location', '--silent', '--show-error', '--max-time', '60', URL, '--output', str(temporary)], check=True)
        if digest(temporary.read_bytes()) != SHA256:
            raise ValueError('Publisher checksum mismatch; no data prepared')
        temporary.replace(source)
    if digest(source.read_bytes()) != SHA256:
        raise ValueError('Cached source checksum mismatch')
    tm_bytes = (BACKEND / 'data/transfermarkt/prepared.json').read_bytes()
    with source.open(encoding='utf-8-sig', newline='') as stream:
        result = match_rows(csv.DictReader(stream), json.loads(tm_bytes))
    result['transfermarktBundleSha256'] = digest(tm_bytes)
    result['preparedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
    (root / 'prepared.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    (root / 'review.json').write_text(json.dumps({'counts': result['counts'], 'clubEvidence': result['clubEvidence'], 'rows': result['review']}, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result['counts'], ensure_ascii=False, indent=2))


if __name__ == '__main__':
    argparse.ArgumentParser(description=__doc__).parse_args()
    prepare()
