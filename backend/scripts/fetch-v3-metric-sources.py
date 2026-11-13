"""Fetch the reviewed, checksum-pinned V3 research snapshot (no database writes)."""
import hashlib
import json
from pathlib import Path
import urllib.request

DATA = Path(__file__).resolve().parents[1] / 'data/v3-metrics'
GITHUB = 'https://raw.githubusercontent.com/m-mahadi/top5-football-dataset/master/data/'
SOURCES = [
    ('player_seasons.csv', GITHUB + 'master/player_seasons.csv', '72faf86d45f32eed6d7154f4d213c1e5732ce7712f234f9ba4c23eaac3fa6543'),
    ('team_standard.csv', GITHUB + 'clean/teams/standard.csv', 'a8397d0f0009d5d235243a26e9569d6d809137ff118e92e12300059dea209a58'),
] + [(role + '.xlsx', f'https://datamb.football/database/OLD/RATOP72526/{role}/{role}.xlsx', sha) for role, sha in [
    ('CB', '77a5beceeb97e838743313f22d6131dbb79e7c1ad6bf9bb3352d9574580bac59'),
    ('FB', '3296c69d2d1feec45a3c7f037e80657cf2c6aa0943d73dbe9963ae467e6064cd'),
    ('CM', 'dddee03a54c08b12b89b7ffdafe43c46207ffa1af012a99e4a910105a2b5194e'),
    ('FW', '38682064243ced0152f4ca9c067a5688acad5333ef041b453fcac935c10cbe95'),
    ('ST', 'efb71eff31abf2e8c15ddedddfbdb3405601c58f655730e0c2c6cfa912484ba0'),
]]


def fetch():
    raw = DATA / 'raw'
    raw.mkdir(parents=True, exist_ok=True)
    files = []
    for name, url, sha in SOURCES:
        destination = raw / name
        if destination.exists() and hashlib.sha256(destination.read_bytes()).hexdigest() == sha:
            print('Cached:', name, flush=True)
        else:
            request = urllib.request.Request(url, headers={'User-Agent': 'FootballTransferResearch/1.0'})
            with urllib.request.urlopen(request, timeout=45) as response:
                body = response.read()
            if hashlib.sha256(body).hexdigest() != sha:
                raise ValueError(f'Source changed; review required before importing: {name}')
            destination.write_bytes(body)
            print('Downloaded:', name, flush=True)
        files.append({'file': name, 'url': url, 'sha256': sha})
    (DATA / 'sources.json').write_text(json.dumps({'season': '2025/2026', 'scope': 'TOP5', 'files': files}, indent=2))


if __name__ == '__main__':
    fetch()
