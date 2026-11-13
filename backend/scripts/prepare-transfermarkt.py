"""Select 2025/26 domestic-league participants and prepare only supported domain fields."""
import argparse
import collections
import csv
import datetime as dt
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "data" / "transfermarkt"
SOURCE = "https://github.com/dcaribou/transfermarkt-datasets"
LEAGUES = {
    "GB1": ("Premier League", "England"), "ES1": ("La Liga", "Spain"),
    "L1": ("Bundesliga", "Germany"), "IT1": ("Serie A", "Italy"),
    "FR1": ("Ligue 1", "France"),
}
POSITIONS = {"Centre-Forward": "ST", "Left Winger": "LW", "Right Winger": "RW", "Attacking Midfield": "CAM",
             "Central Midfield": "CM", "Defensive Midfield": "CDM", "Centre-Back": "CB", "Right-Back": "RB",
             "Left-Back": "LB", "Goalkeeper": "GK", "Left Midfield": "LW", "Right Midfield": "RW", "Second Striker": "ST",
             "Right Wing-Back": "RB", "Left Wing-Back": "LB", "Right Central Midfield": "CM", "Left Central Midfield": "CM"}
POSITION_CODES = {code: code for code in ["ST", "LW", "RW", "CDM", "CAM", "CM", "CB", "RB", "LB", "GK"]}
POSITION_CODES.update({"CF": "ST", "SS": "ST", "RWB": "RB", "LWB": "LB", "RCM": "CM", "LCM": "CM", "LM": "LW", "RM": "RW"})
METRICS = {"minutes_played": "minutesPlayed", "goals": "goals", "assists": "assists", "yellow_cards": "yellowCards", "red_cards": "redCards"}
MISSING_METRICS = ["tacklesWon", "interceptions", "keyPasses", "passesCompleted", "passesAttempted"]


def integer(value, minimum=0):
    text = str(value).strip()
    if not text.isdigit() or int(text) < minimum:
        raise ValueError("Invalid integer: " + repr(value))
    return int(text)


def date(value):
    return dt.date.fromisoformat(value[:10]).isoformat()


def rows(root, table, required):
    with gzip.open(root / "raw" / (table + ".csv.gz"), "rt", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if not set(required).issubset(reader.fieldnames or []):
            raise ValueError("Unexpected source columns in " + table)
        yield from reader


def prepare(root=ROOT, as_of=None):
    as_of = as_of or (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=7)).date().isoformat()
    manifest = json.loads((root / "download-manifest.json").read_text(encoding="utf-8"))
    for item in manifest["tables"]:
        actual = hashlib.sha256((root / "raw" / (item["table"] + ".csv.gz")).read_bytes()).hexdigest()
        if actual != item["sha256"]:
            raise ValueError("Checksum mismatch: " + item["table"])
    competitions = {row["competition_id"]: row for row in rows(root, "competitions", ["competition_id", "type", "sub_type"])}
    for league in LEAGUES:
        if competitions.get(league, {}).get("type") != "domestic_league" or competitions[league]["sub_type"] != "first_tier":
            raise ValueError("Missing first-tier domestic competition: " + league)
    games = {}
    club_leagues = collections.defaultdict(set)
    for row in rows(root, "games", ["game_id", "season", "competition_id", "date", "home_club_id", "away_club_id", "home_club_goals", "away_club_goals"]):
        if row["season"] != "2025" or row["competition_id"] not in LEAGUES:
            continue
        if date(row["date"]) > as_of or not row["home_club_goals"] or not row["away_club_goals"]:
            continue
        games[row["game_id"]] = row
        for key in ["home_club_id", "away_club_id"]:
            club_leagues[row[key]].add(row["competition_id"])
    if set(row["competition_id"] for row in games.values()) != set(LEAGUES):
        raise ValueError("Source does not contain 2025/26 games for all five selected leagues; refusing a partial season substitution.")
    totals, membership = {}, collections.defaultdict(set)
    per_league, seen, invalid = collections.defaultdict(set), set(), []
    for row in rows(root, "appearances", ["appearance_id", "game_id", "player_id", "player_club_id", *METRICS]):
        game = games.get(row["game_id"])
        if not game:
            continue
        key = (row["game_id"], row["player_id"])
        if key in seen:
            raise ValueError("Duplicate player/game appearance: " + repr(key))
        seen.add(key)
        if row["player_club_id"] not in [game["home_club_id"], game["away_club_id"]]:
            raise ValueError("Appearance club does not match fixture.")
        try:
            values = {target: integer(row[source]) for source, target in METRICS.items()}
        except ValueError:
            invalid.append({"playerId": row["player_id"], "gameId": row["game_id"]})
            continue
        if values["minutesPlayed"] <= 0:
            continue
        pid = row["player_id"]
        target = totals.setdefault(pid, {"season": "2025/2026", "appearances": 0, **{field: 0 for field in METRICS.values()}, **{field: None for field in MISSING_METRICS}})
        target["appearances"] += 1
        for field, value in values.items():
            target[field] += value
        membership[pid].add(row["player_club_id"])
        per_league[game["competition_id"]].add(pid)
    # Never turn a partial sum with unknown required counters into a complete season.
    if invalid:
        raise ValueError("Invalid appearance counters; review before importing: " + repr(invalid[:5]))
    profiles = {row["player_id"]: row for row in rows(root, "players", ["player_id", "name", "date_of_birth", "country_of_citizenship", "sub_position", "height_in_cm", "foot"])}
    selected, skipped = [], []
    for pid in sorted(totals, key=int):
        row = profiles.get(pid, {})
        try:
            birth = date(row.get("date_of_birth", ""))
            original_position = row.get("sub_position", "").strip()
            position = POSITIONS.get(original_position) or POSITION_CODES.get(original_position.upper())
            if position is None:
                raise ValueError("Missing or unsupported source position")
            if not row.get("name") or not row.get("country_of_citizenship") or birth > as_of:
                raise ValueError("Missing core profile")
            height = integer(row["height_in_cm"], 1) if row.get("height_in_cm") else None
            foot = {"left": "LEFT", "right": "RIGHT", "both": "BOTH", "": None}[row.get("foot", "")]
            player = {"transfermarktId": integer(pid, 1), "name": row["name"], "dateOfBirth": birth,
                      "nationality": row["country_of_citizenship"], "position": position, "secondaryPositions": [],
                      "height": height, "preferredFoot": foot, "marketValue": None}
            for field, limit in [("name", 100), ("nationality", 100)]:
                if len(player[field]) > limit:
                    raise ValueError("Profile text too long: " + field)
            selected.append({"player": player, "stats": totals[pid], "provenance": {
                "sourceUrl": row.get("url"), "clubsDuringSeason": sorted(membership[pid], key=int),
                "sourcePosition": original_position, "positionPolicy": "TEN_ROLES_V1",
                "profileClubAtSnapshot": row.get("current_club_id"),
                "reportedContractEndAtSnapshot": row.get("contract_expiration_date") or None,
                "note": "Snapshot metadata is not proof of today's club or contract. No inferred contract or secondary positions.",
            }})
        except (ValueError, KeyError) as exc:
            skipped.append({"transfermarktId": pid, "name": row.get("name"), "reason": str(exc)})
    selected_ids = {str(entry["player"]["transfermarktId"]): entry for entry in selected}
    values, conflicts = {}, []
    for row in rows(root, "player_valuations", ["player_id", "date", "market_value_in_eur"]):
        if row["player_id"] not in selected_ids:
            continue
        valued_at = date(row["date"])
        if valued_at > as_of:
            continue
        amount = str(integer(row["market_value_in_eur"]))
        key = (row["player_id"], valued_at)
        if key in values and values[key] != amount:
            conflicts.append(key)
        values[key] = amount
    if conflicts:
        raise ValueError("Conflicting same-day valuations, review required: " + repr(conflicts[:5]))
    valuations = [{"transfermarktId": int(pid), "valuedAt": valued_at, "marketValue": value, "source": SOURCE, "reliability": "UNKNOWN"}
                  for (pid, valued_at), value in sorted(values.items(), key=lambda item: (int(item[0][0]), item[0][1]))]
    for row in valuations:
        # Iteration in date order makes this the latest known valuation, never a fabricated today's quote.
        selected_ids[str(row["transfermarktId"])]["player"]["marketValue"] = row["marketValue"]
        selected_ids[str(row["transfermarktId"])]["provenance"]["marketValueAsOf"] = row["valuedAt"]
    club_rows = {row["club_id"]: row for row in rows(root, "clubs", ["club_id", "name"])}
    clubs = []
    for cid, leagues in sorted(club_leagues.items(), key=lambda item: int(item[0])):
        if len(leagues) != 1 or cid not in club_rows:
            raise ValueError("Missing or ambiguous season club: " + cid)
        league = next(iter(leagues))
        clubs.append({"transfermarktId": int(cid), "name": club_rows[cid]["name"], "country": LEAGUES[league][1], "league": LEAGUES[league][0], "foundedYear": None})
    coverage = []
    for league, (name, _) in LEAGUES.items():
        pool = per_league[league]
        prepared = len(pool.intersection(selected_ids))
        coverage.append({"competitionId": league, "league": name, "games": sum(g["competition_id"] == league for g in games.values()),
                         "sourceParticipants": len(pool), "preparedPlayers": prepared, "profileCoveragePercent": round(100 * prepared / len(pool), 2)})
    bundle = {"provider": SOURCE, "season": "2025/2026", "asOf": as_of, "download": manifest, "clubs": clubs, "players": selected, "valuations": valuations,
              "report": {"coverageBasis": "Players with positive minutes in the downloaded 2025/26 domestic-league appearances, NOT all registered squads or independently verified completeness.",
                         "coverage": coverage, "uniqueSourceParticipants": len(totals), "preparedPlayers": len(selected), "skippedProfiles": skipped,
                         "missingStatistics": MISSING_METRICS,
                         "notImported": {"contracts": "Only reported expiration date is present; no start date/salary or current verification. Preserved as provenance, no invented Contract.",
                                         "injuryHistories": "No injury table in this dataset; no inferred healthy status.",
                                         "transfers": "Flat CSV lacks reliable transfer type (loan/permanent/free); do not guess types.",
                                         "privateData": "No automatic matching inputs, requirements, verification, shortlist, notification, or matching score for real players."}}}
    root.mkdir(parents=True, exist_ok=True)
    (root / "prepared.json").write_text(json.dumps(bundle, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"clubs": len(clubs), "players": len(selected), "stats": len(selected), "valuations": len(valuations), **bundle["report"]}, ensure_ascii=False, indent=2))
    return bundle


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--as-of")
    args = parser.parse_args()
    prepare(as_of=date(args.as_of) if args.as_of else None)
