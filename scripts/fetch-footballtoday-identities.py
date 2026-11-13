"""Verify candidate aliases using public player JSON-LD birth dates; never use approximate names."""
import concurrent.futures
import importlib.util
import json
import re
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND / 'data/stats-enrichment'
spec = importlib.util.spec_from_file_location('reader', BACKEND / 'scripts/fetch-footballtoday-stats.py')
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


def persons(text):
    found = []
    def visit(value):
        if isinstance(value, list):
            for item in value:
                visit(item)
        elif isinstance(value, dict):
            if value.get('@type') == 'Person':
                found.append(value)
            for item in value.values():
                if isinstance(item, (dict, list)):
                    visit(item)
    for match in re.finditer(r'<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', text, re.S | re.I):
        try:
            # The publisher embeds literal newlines in FAQ text strings. Allow
            # JSON string control characters; still parse structure, never eval.
            visit(json.loads(match.group(1), strict=False))
        except json.JSONDecodeError:
            continue
    return found


def main():
    candidates = json.loads((ROOT / 'identity-candidates.json').read_text())
    def check(row):
        try:
            _, source = reader.fetch(reader.HOST + row['slug'])
            people = persons((reader.ROOT / source['file']).read_text())
            if (len(people) == 1 and people[0].get('birthDate', '')[:10] == row['dateOfBirth']
                    and people[0].get('mainEntityOfPage') == source['url']):
                return {**row, 'source': source, 'sourceName': people[0].get('name')}
        except Exception as error:
            print(json.dumps({'slug': row['slug'], 'error': str(error)}), flush=True)
        return None
    accepted = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for i, result in enumerate(pool.map(check, candidates), 1):
            if result:
                accepted.append(result)
            if i % 30 == 0:
                print(json.dumps({'checked': i, 'total': len(candidates), 'dobMatched': len(accepted)}), flush=True)
    (ROOT / 'verified-identities.json').write_text(json.dumps(accepted, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'checked': len(candidates), 'dobMatched': len(accepted)}), flush=True)


if __name__ == '__main__':
    main()
