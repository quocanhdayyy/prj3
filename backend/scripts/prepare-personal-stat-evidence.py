"""Personal evidence for estimates only: never relax the observed-data importer."""
import csv
import hashlib
import json
import unicodedata
from collections import defaultdict, Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSV = ROOT / 'data/supplemental-stats/raw/sofascore_player_seasons.csv'
EXPECTED = 'acf7b7aa303c8de040de30ad2f367ea7c30b61e75d6d10dac2611f36963bbcc6'
LEAGUES = {'ENG-Premier League': 'Premier League', 'ESP-La Liga': 'La Liga', 'ITA-Serie A': 'Serie A', 'GER-Bundesliga': 'Bundesliga', 'FRA-Ligue 1': 'Ligue 1'}
FIELDS = {'tacklesWon': 'tacklesWon', 'interceptions': 'interceptions', 'keyPasses': 'keyPasses', 'passesCompleted': 'accuratePasses', 'passesAttempted': 'totalPasses'}
URL = 'https://raw.githubusercontent.com/m-mahadi/top5-football-dataset/8940299c2c56c2c0932d3caf292336f5e1689893/data/clean/sofascore_player_seasons.csv'


def key(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', str(value)).casefold() if c.isalnum())


def integer(value):
    number = float(value)
    if not number.is_integer() or not 0 <= number <= 2147483647:
        raise ValueError('Not a valid counter')
    return int(number)


def prepare():
    source_hash = hashlib.sha256(CSV.read_bytes()).hexdigest()
    assert source_hash == EXPECTED
    bundle = json.loads((ROOT / 'data/transfermarkt/prepared.json').read_text())
    profiles = {str(e['player']['transfermarktId']): e for e in bundle['players']}
    names = defaultdict(set)
    for tid, entry in profiles.items():
        names[key(entry['player']['name'])].add(tid)
    bridges = defaultdict(set)
    identity_file = ROOT / 'data/stats-enrichment/reference/reep-people.csv'
    with identity_file.open() as handle:
        for row in csv.DictReader(handle):
            tid = row['key_transfermarkt']
            if tid not in profiles or row['date_of_birth'] != profiles[tid]['player']['dateOfBirth']:
                continue
            for name in [row['name'], row['full_name']]:
                if name:
                    names[key(name)].add(tid)
            if row['key_sofascore']:
                bridges[row['key_sofascore']].add(tid)
    club_bundle = json.loads((ROOT / 'data/supplemental-stats/prepared.json').read_text())
    mapping = {(e['league'], e['sourceTeamKey']): str(e['transfermarktClubId']) for e in club_bundle['clubEvidence']}
    clubs = {str(c['transfermarktId']): c for c in bundle['clubs']}
    with CSV.open() as handle:
        rows = list(csv.DictReader(handle))
    candidates = defaultdict(list)
    for line, row in enumerate(rows, 2):
        if row['league'] not in LEAGUES or row['season'] not in ['2526', '2425'] or row['type'] != 'overall':
            continue
        ids = bridges.get(row['player_id']) or names.get(key(row['player']), set())
        if len(ids) != 1:
            continue
        tid = next(iter(ids))
        if tid in profiles:
            candidates[tid].append((line, row, 'PROVIDER_ID_DOB_BRIDGE' if bridges.get(row['player_id']) else 'UNIQUE_FULL_NAME'))
    output = []
    counts = Counter()
    for tid, matches in candidates.items():
        entry = profiles[tid]
        memberships = entry['provenance']['clubsDuringSeason']
        leagues = {clubs[c]['league'] for c in memberships if c in clubs}
        accepted = []
        for line, row, identity in matches:
            try:
                minutes = integer(row['minutesPlayed'])
                if minutes <= 0:
                    continue
                current = row['season'] == '2526'
                source_club = mapping.get((row['league'], key(row['team'])))
                same_club = source_club in memberships
                # Cross-provider totals with different counting definitions stay estimates.
                if current:
                    baseline = entry['stats']
                    if len(leagues) != 1 or LEAGUES[row['league']] not in leagues or not same_club:
                        continue
                    if any(integer(row[f]) != baseline[f] for f in ['appearances', 'goals', 'assists']):
                        continue
                    if abs(minutes - baseline['minutesPlayed']) > max(15, baseline['minutesPlayed'] * 0.25):
                        continue
                else:
                    # Historical identities need an ID+DOB bridge or a corroborated 25/26 row.
                    corroborated = identity == 'PROVIDER_ID_DOB_BRIDGE' or any(
                        r['season'] == '2526' and r['player_id'] == row['player_id'] and
                        mapping.get((r['league'], key(r['team']))) in memberships
                        for _, r, _ in matches)
                    if not corroborated or minutes < 450:
                        continue
                values = {}
                for field, source_field in FIELDS.items():
                    try:
                        values[field] = integer(row[source_field])
                    except (ValueError, TypeError):
                        pass
                if not values or ('passesCompleted' in values and 'passesAttempted' in values and values['passesCompleted'] > values['passesAttempted']):
                    continue
                accepted.append({'sourceSeason': '2025/2026' if current else '2024/2025', 'minutes': minutes, 'values': values,
                                 'identityBasis': identity, 'sourcePlayerId': int(row['player_id']), 'sourceTeam': row['team'],
                                 'league': LEAGUES[row['league']], 'row': line})
            except (ValueError, KeyError):
                continue
        # More than one row for the same season is ambiguous; do not silently select a club stint.
        for season in ['2025/2026', '2024/2025']:
            chosen = [e for e in accepted if e['sourceSeason'] == season]
            if len(chosen) != 1:
                continue
            output.append({'transfermarktId': int(tid), 'name': entry['player']['name'], 'dateOfBirth': entry['player']['dateOfBirth'],
                           **chosen[0], 'sourceUrl': URL, 'sourceSha256': source_hash})
            counts[season] += 1
    result = {'method': 'PERSONAL_SOURCE_EVIDENCE_V1', 'targetSeason': '2025/2026', 'sourceSha256': source_hash,
              'identityBridgeSha256': hashlib.sha256(identity_file.read_bytes()).hexdigest(),
              'scope': 'Top-five-league cohort only; current and prior-season evidence remains separate, not observed 25/26 totals.',
              'counts': dict(counts), 'entries': output}
    target = ROOT / 'data/maintenance/personal-stat-evidence.json'
    target.parent.mkdir(exist_ok=True, mode=0o700)
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'evidenceRows': len(output), 'counts': dict(counts)}))


if __name__ == '__main__':
    prepare()
