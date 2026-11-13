import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('enrichment', Path(__file__).resolve().parents[1] / 'scripts/prepare-stats-enrichment.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class EnrichmentTests(unittest.TestCase):
    def test_unknown_vs_explicit_zero(self):
        self.assertIsNone(m.counter(''))
        self.assertIsNone(m.counter(None))
        self.assertEqual(m.counter('0.0'), 0)
        for bad in ['-1', '1.5', 'NaN', '0%', '2147483648']:
            with self.assertRaises(ValueError): m.counter(bad)

    def test_scope_guard_and_minor_minutes(self):
        baseline = {'appearances': 30, 'minutesPlayed': 2000, 'goals': 5}
        self.assertTrue(m.baseline_matches({**baseline, 'minutesPlayed': 2020}, baseline))
        self.assertFalse(m.baseline_matches({**baseline, 'minutesPlayed': 2021}, baseline))
        self.assertFalse(m.baseline_matches({**baseline, 'appearances': 29}, baseline))
        self.assertFalse(m.baseline_matches({**baseline, 'goals': 4}, baseline))
        self.assertFalse(m.baseline_matches({**baseline, 'minutesPlayed': None}, baseline))
        self.assertTrue(m.baseline_matches({**baseline, 'goals': None}, baseline))
        self.assertIsNone(m.counter(None))  # Unchecked goals were never fabricated as zero.

    def test_unanimous_club_evidence(self):
        clubs = {'1': {'league': 'Premier League'}, '2': {'league': 'Premier League'}}
        tm = {str(i): {'provenance': {'clubsDuringSeason': ['1']}} for i in range(1, 4)}
        rows = [{'tmId': str(i), 'provider': 'Fixture', 'league': 'GB1', 'team': 'example'} for i in range(1, 4)]
        self.assertEqual(len(m.establish_clubs(rows[:2], tm, clubs)[0]), 0)
        self.assertEqual(len(m.establish_clubs(rows, tm, clubs)[0]), 1)
        tm['3']['provenance']['clubsDuringSeason'] = ['2']
        self.assertEqual(len(m.establish_clubs(rows, tm, clubs)[0]), 0)

    def test_raw_html_total_not_rounded_rate(self):
        p = m._reader.Page('<table><tr><th>#</th><th>Player</th><th>Average</th><th>Total</th></tr>'
                           '<tr><td>1</td><td><a href="/player/example">Example</a></td><td>0.3</td><td>8</td></tr></table>')
        self.assertEqual(m.counter(p.rows[1]['cells'][-1]), 8)
        self.assertEqual(p.rows[1]['links'], ['/player/example'])

    def test_profile_birth_date_is_structured_evidence(self):
        profile_spec = importlib.util.spec_from_file_location('profiles', Path(__file__).resolve().parents[1] / 'scripts/fetch-footballtoday-identities.py')
        profiles = importlib.util.module_from_spec(profile_spec)
        profile_spec.loader.exec_module(profiles)
        page = '<script type="application/ld+json">{"@graph":[{"@type":"Person","birthDate":"2000-05-23T01:00:00+01:00"}]}</script>'
        self.assertEqual(profiles.persons(page)[0]['birthDate'][:10], '2000-05-23')
        self.assertEqual(profiles.persons('<div>Born 2000-05-23</div>'), [])
        self.assertEqual(profiles.persons('<script type="application/ld+json">invalid</script>'), [])


if __name__ == '__main__': unittest.main()
