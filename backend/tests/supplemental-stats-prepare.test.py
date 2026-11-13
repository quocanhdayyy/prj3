import copy
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('supplement', Path(__file__).resolve().parents[1] / 'scripts/prepare-supplemental-stats.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SourceJoinTests(unittest.TestCase):
    def setUp(self):
        self.bundle = {'provider': 'https://github.com/dcaribou/transfermarkt-datasets', 'season': '2025/2026',
                       'clubs': [{'transfermarktId': 10, 'name': 'Example FC', 'league': 'Premier League'},
                                 {'transfermarktId': 20, 'name': 'Other FC', 'league': 'La Liga'}], 'players': []}
        self.rows = []
        for i in range(1, 5):
            self.bundle['players'].append({'player': {'transfermarktId': i, 'name': f'Player {i}', 'dateOfBirth': '2000-01-01'},
                                          'provenance': {'clubsDuringSeason': ['10']},
                                          'stats': {'appearances': 30, 'minutesPlayed': 2000, 'goals': 5, 'assists': 4, 'yellowCards': 3, 'redCards': 0}})
            self.rows.append({'player_id': str(i + 100), 'player': f'Player {i}', 'team': 'Example', 'season': '2526',
                              'league': 'ENG-Premier League', 'tourn_id': '17', 'season_id': '76986', 'type': 'overall',
                              'appearances': '30', 'minutesPlayed': '2000', 'goals': '5',
                              'tacklesWon': '0', 'interceptions': '10', 'keyPasses': '20', 'accuratePasses': '400', 'totalPasses': '500'})

    def run_join(self):
        return module.match_rows(self.rows, self.bundle)

    def test_only_requested_season_and_explicit_zero(self):
        old = {**self.rows[0], 'season': '2425'}
        self.rows.append(old)
        result = self.run_join()
        self.assertEqual(len(result['entries']), 4)
        self.assertEqual(result['entries'][0]['statistics']['tacklesWon'], 0)
        self.assertNotIn('fifa_wage', result['entries'][0]['statistics'])

    def test_unknown_is_not_zero_and_invalid_passes_rejected(self):
        self.rows[0]['keyPasses'] = ''
        self.assertEqual(self.run_join()['counts']['invalid_or_missing_statistics'], 1)
        self.rows[0]['keyPasses'] = '20'
        self.rows[0]['accuratePasses'] = '501'
        self.assertEqual(self.run_join()['counts']['invalid_or_missing_statistics'], 1)

    def test_duplicate_aborts(self):
        self.rows.append(copy.deepcopy(self.rows[0]))
        with self.assertRaises(ValueError):
            self.run_join()

    def test_ambiguous_names_never_fuzzy_match(self):
        other = copy.deepcopy(self.bundle['players'][0])
        other['player']['transfermarktId'] = 99
        self.bundle['players'].append(other)
        self.assertEqual(self.run_join()['counts']['ambiguous_or_missing_full_name'], 1)
        self.rows[1]['player'] = 'P. 2'
        self.assertEqual(self.run_join()['counts']['ambiguous_or_missing_full_name'], 2)

    def test_minute_guard_and_count_mismatch(self):
        self.rows[0]['minutesPlayed'] = '2020'
        result = self.run_join()
        self.assertEqual(result['entries'][0]['provenance']['retainedMinutesPlayed'], 2000)
        self.assertEqual(result['counts']['rowsWithMinorMinuteDifference'], 1)
        self.rows[0]['minutesPlayed'] = '2021'
        self.assertEqual(self.run_join()['counts']['minutes_differ_beyond_tolerance'], 1)
        self.rows[0]['minutesPlayed'] = '2000'
        self.rows[0]['appearances'] = '29'
        self.assertEqual(self.run_join()['counts']['appearances_or_goals_differ'], 1)

    def test_cross_league_partial_season_excluded(self):
        self.bundle['players'][0]['provenance']['clubsDuringSeason'].append('20')
        self.assertEqual(self.run_join()['counts']['cross_league_or_unknown_scope'], 1)

    def test_club_requires_multiple_unanimous_identity_anchors(self):
        self.rows = self.rows[:2]
        self.assertEqual(self.run_join()['counts']['acceptedRows'], 0)
        self.rows = [{**r, 'team': 'Conflicting team'} for r in self.rows]
        self.rows.append({**self.rows[0], 'player_id': '103', 'player': 'Player 3'})
        self.bundle['clubs'].append({'transfermarktId': 30, 'name': 'Rival FC', 'league': 'Premier League'})
        self.bundle['players'][2]['provenance']['clubsDuringSeason'] = ['30']
        self.assertEqual(self.run_join()['counts']['acceptedRows'], 0)


if __name__ == '__main__':
    unittest.main()
