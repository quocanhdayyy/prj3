import contextlib
import csv
import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("prepare", Path(__file__).resolve().parents[1] / "scripts" / "prepare-transfermarkt.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PreparationTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.games, self.players, self.apps, self.clubs, self.values = [], [], [], [], []
        self.competitions = [{"competition_id": league, "type": "domestic_league", "sub_type": "first_tier"} for league in module.LEAGUES]
        for i, league in enumerate(module.LEAGUES, 1):
            cid, away, gid, pid = str(i), str(i + 100), str(i), str(i)
            self.clubs.extend([{"club_id": cid, "name": "Home " + cid}, {"club_id": away, "name": "Away " + away}])
            self.games.append({"game_id": gid, "competition_id": league, "season": "2025", "date": "2025-09-01", "home_club_id": cid,
                               "away_club_id": away, "home_club_goals": "2", "away_club_goals": "0"})
            self.players.append({"player_id": pid, "name": "Player " + pid, "date_of_birth": "2000-01-01 00:00:00", "country_of_citizenship": "Vietnam",
                                 "sub_position": "Centre-Forward", "height_in_cm": "", "foot": ""})
            self.apps.append({"appearance_id": gid + "_" + pid, "game_id": gid, "player_id": pid, "player_club_id": cid,
                              "minutes_played": "90", "goals": "1", "assists": "0", "yellow_cards": "0", "red_cards": "0"})
            self.values.extend([{"player_id": pid, "date": "2025-06-01", "market_value_in_eur": "100"},
                                {"player_id": pid, "date": "2026-06-01", "market_value_in_eur": "120"},
                                {"player_id": pid, "date": "2027-06-01", "market_value_in_eur": "999"}])

    def tearDown(self):
        self.tmp.cleanup()

    def prepare(self):
        tables = {"competitions": self.competitions, "clubs": self.clubs, "players": self.players, "games": self.games,
                  "appearances": self.apps, "player_valuations": self.values, "transfers": [{"player_id": "1"}]}
        manifest = {"tables": []}
        (self.root / "raw").mkdir(exist_ok=True)
        for name, rows in tables.items():
            target = self.root / "raw" / (name + ".csv.gz")
            with gzip.open(target, "wt", encoding="utf-8", newline="") as stream:
                writer = csv.DictWriter(stream, fieldnames=rows[0].keys())
                writer.writeheader()
                writer.writerows(rows)
            manifest["tables"].append({"table": name, "sha256": hashlib.sha256(target.read_bytes()).hexdigest()})
        (self.root / "download-manifest.json").write_text(json.dumps(manifest))
        with contextlib.redirect_stdout(io.StringIO()):
            return module.prepare(self.root, "2026-10-16")

    def test_scope_nulls_and_no_future_valuations(self):
        self.games.extend([{**self.games[0], "game_id": "90", "season": "2024"}, {**self.games[0], "game_id": "91", "competition_id": "CL"}])
        self.apps.extend([{**self.apps[0], "game_id": "90", "goals": "50"}, {**self.apps[0], "game_id": "91", "goals": "50"}])
        bundle = self.prepare()
        self.assertEqual(len(bundle["players"]), 5)
        self.assertEqual(len(bundle["clubs"]), 10)
        self.assertEqual(len(bundle["valuations"]), 10)
        for entry in bundle["players"]:
            self.assertEqual(entry["stats"]["goals"], 1)
            self.assertEqual(entry["stats"]["appearances"], 1)
            self.assertEqual(entry["player"]["marketValue"], "120")
            self.assertIsNone(entry["player"]["height"])
            self.assertIsNone(entry["player"]["preferredFoot"])
            for field in module.MISSING_METRICS:
                self.assertIsNone(entry["stats"][field])

    def test_duplicate_appearance_rejected(self):
        self.apps.append(self.apps[0].copy())
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            self.prepare()

    def test_unknown_required_counter_is_not_zero(self):
        self.apps[0]["goals"] = ""
        with self.assertRaisesRegex(ValueError, "Invalid appearance counters"):
            self.prepare()

    def test_conflicting_valuation_rejected(self):
        self.values.append({**self.values[0], "market_value_in_eur": "999"})
        with self.assertRaisesRegex(ValueError, "Conflicting"):
            self.prepare()

    def test_unplayed_players_excluded_and_source_roles_normalized(self):
        self.players[0]["sub_position"] = "Left Midfield"
        self.players.append({**self.players[0], "player_id": "10000"})
        self.apps.append({**self.apps[0], "player_id": "10000", "minutes_played": "0"})
        bundle = self.prepare()
        self.assertEqual(len(bundle["players"]), 5)
        self.assertEqual(bundle["players"][0]["player"]["position"], "LW")
        self.assertEqual(bundle["players"][0]["provenance"]["sourcePosition"], "Left Midfield")
        self.assertEqual(bundle["players"][0]["player"]["secondaryPositions"], [])

    def test_role_aliases(self):
        for source, target in [("RWB", "RB"), ("LWB", "LB"), ("RCM", "CM"), ("LCM", "CM"), ("CF", "ST"), ("SS", "ST"), ("GK", "GK")]:
            with self.subTest(source=source):
                self.players[0]["sub_position"] = source
                self.assertEqual(self.prepare()["players"][0]["player"]["position"], target)

    def test_cross_league_transfer_aggregated_once_per_player_season(self):
        self.apps[1]["player_id"] = self.apps[0]["player_id"]
        bundle = self.prepare()
        self.assertEqual(len(bundle["players"]), 4)
        self.assertEqual(bundle["players"][0]["stats"]["appearances"], 2)
        self.assertEqual(bundle["players"][0]["stats"]["minutesPlayed"], 180)
        self.assertEqual(bundle["players"][0]["provenance"]["clubsDuringSeason"], ["1", "2"])

    def test_removed_leagues_excluded_even_after_player_transfer(self):
        for i, league in enumerate(['TR1', 'PO1', 'NL1'], 90):
            self.competitions.append({'competition_id': league, 'type': 'domestic_league', 'sub_type': 'first_tier'})
            self.games.append({**self.games[0], 'game_id': str(i), 'competition_id': league})
            self.apps.append({**self.apps[0], 'game_id': str(i), 'goals': '50'})
        bundle = self.prepare()
        self.assertEqual(set(r['competitionId'] for r in bundle['report']['coverage']), {'GB1','ES1','L1','IT1','FR1'})
        self.assertEqual(bundle['players'][0]['stats']['goals'], 1)
        self.assertEqual(bundle['players'][0]['stats']['minutesPlayed'], 90)


if __name__ == "__main__":
    unittest.main()
