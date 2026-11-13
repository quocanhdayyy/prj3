"""Propose profile checks, not automatic identity matches, from known club and totals."""
import collections
import importlib.util
import json
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND / 'data/stats-enrichment'
spec = importlib.util.spec_from_file_location('enrichment', BACKEND / 'scripts/prepare-stats-enrichment.py')
enrichment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(enrichment)


def main():
    bundle = json.loads((BACKEND / 'data/transfermarkt/prepared.json').read_text())
    prepared = json.loads((ROOT / 'prepared.json').read_text())
    clubs = {(r['league'], r['team']): str(r['transfermarktClubId'])
             for r in prepared['clubEvidence'] if r['provider'] == 'FootballToday'}
    known_names = {enrichment.key(e['player']['name']) for e in bundle['players']}
    current = {r['player']['transfermarktId']: r
               for r in json.loads((ROOT / 'current-known.json').read_text())}
    by_club = collections.defaultdict(list)
    for entry in bundle['players']:
        memberships = entry['provenance']['clubsDuringSeason']
        if len(memberships) == 1:
            by_club[str(memberships[0])].append(entry)
    result = []
    for file in sorted((ROOT / 'footballtoday').glob('*.json')):
        snapshot = json.loads(file.read_text())
        combined = collections.defaultdict(dict)
        for table in snapshot['tables']:
            for row in table['rows']:
                combined[(table['teamId'], row['slug'])][table['field']] = row['value']
        for (team, slug), stats in combined.items():
            if enrichment.key(slug.removeprefix('/player/')) in known_names:
                continue
            club = clubs.get((snapshot['league'], team))
            candidates = [e for e in by_club.get(club, []) if enrichment.baseline_matches(stats, e['stats'])]
            if len(candidates) != 1:
                continue
            entry = candidates[0]
            tid = entry['player']['transfermarktId']
            if tid not in current or not any(current[tid][f] is None and f in stats for f in enrichment.FIELDS):
                continue
            result.append({'slug': slug, 'league': snapshot['league'], 'teamId': team,
                           'transfermarktId': tid, 'name': entry['player']['name'],
                           'dateOfBirth': entry['player']['dateOfBirth']})
    (ROOT / 'identity-candidates.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'profileChecksProposed': len(result)}))


if __name__ == '__main__':
    main()
