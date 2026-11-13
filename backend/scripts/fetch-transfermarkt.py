"""Download the publisher's CSV snapshots. Never execute downloaded content."""
import concurrent.futures
import csv
import datetime
import gzip
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1] / "data" / "transfermarkt"
BASE = "https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/"
TABLES = ["competitions", "clubs", "players", "games", "appearances", "player_valuations", "transfers"]


def download(table):
    target = ROOT / "raw" / (table + ".csv.gz")
    url = BASE + target.name
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        part = target.with_suffix(target.suffix + ".part")
        subprocess.run(["curl", "--fail", "--silent", "--show-error", "--location", "--retry", "2",
                        "--max-time", "300", "--output", str(part), url], check=True)
        # Read to EOF so truncated or invalid gzip downloads never become usable cache entries.
        with gzip.open(part, "rb") as stream:
            while stream.read(1024 * 1024):
                pass
        part.replace(target)
    with gzip.open(target, "rt", encoding="utf-8-sig", newline="") as stream:
        columns = next(csv.reader(stream))
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    print(json.dumps({"table": table, "bytes": target.stat().st_size, "columns": columns}), flush=True)
    return {"table": table, "url": url, "bytes": target.stat().st_size, "sha256": digest, "columns": columns}


def main():
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        tables = list(pool.map(download, TABLES))
    metadata = {
        "provider": "dcaribou/transfermarkt-datasets",
        "repository": "https://github.com/dcaribou/transfermarkt-datasets",
        "retrievedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "sourceNotice": "Publisher reports updates paused; snapshot covers data up to July 2026, not current registration/contract proof.",
        "tables": tables,
    }
    (ROOT / "download-manifest.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
