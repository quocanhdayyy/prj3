"""Regression checks for identity joins, denominators and imputation boundaries."""
import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('metrics', ROOT / 'scripts/prepare-v3-metrics.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


def profile(i=1, position='ST', minutes=900):
    return {'player': {'id':i,'transfermarktId':100+i,'name':f'Player {i}', 'dateOfBirth':'2000-01-01',
                       'position':position,'height':180},
            'stats': {'id':i,'minutesPlayed':minutes,'goals':5,'assists':2,'appearances':10,
                      'keyPasses':None,'passesCompleted':200,'tacklesWon':5,'interceptions':3},
            'estimate':None,'inputHash':str(i)}


class MetricsTests(unittest.TestCase):
    def test_tiny_aerial_samples_without_counts_remain_missing(self):
        prediction=m.metric(57.3,'ESTIMATED','PERSONAL_PRIOR_ONLY','PERCENT')
        missing=m.aerial_ratio_with_counts(prediction,'CM',18)
        self.assertIsNone(missing['value'])
        self.assertEqual(missing['status'],'MISSING')
        self.assertEqual(missing['prediction'],prediction)
        ready=m.aerial_ratio_with_counts(prediction,'CM',900)
        self.assertEqual(ready['attempts'],25)
        self.assertEqual(ready['successes'],14)
        observed=m.metric(60,'DERIVED','SOURCE','PERCENT',successes=3,attempts=5)
        self.assertIs(m.aerial_ratio_with_counts(observed,'CM',10),observed)

    def test_missing_is_not_zero_and_originals_take_priority(self):
        p = profile(); p['estimate']={'method':'OLD','values':{'keyPasses':7,'passesCompleted':999}}
        before=copy.deepcopy(p); values=m.base_metrics(p)
        self.assertEqual(values['passesCompletedPer90']['value'],20)
        self.assertEqual(values['passesCompletedPer90']['status'],'DERIVED')
        self.assertEqual(values['keyPassesPer90']['status'],'ESTIMATED')
        self.assertEqual(values['keyPassesPer90']['value'],.7)
        p['stats']['keyPasses']=0
        self.assertEqual(m.base_metrics(p)['keyPassesPer90']['value'],0)
        p['stats']['minutesPlayed']=0
        self.assertEqual(m.base_metrics(p),{})
        self.assertEqual(before['stats']['keyPasses'],None)

    def test_personal_rate_uses_its_own_minutes_and_marks_alignment(self):
        row={'season':'2526','team':'Example','ss_minutesPlayed':'1000','ss_expectedGoals':'8',
             'ss_aerialDuelsWon':'6','ss_aerialLost':'4','ss_player_id':'777'}
        value=m.source_metrics((2,row,'PROVIDER_ID_AND_VERIFIED_DOB'),profile(),{'url':'test'})
        self.assertEqual(value['expectedGoalsPer90']['value'],.72)
        self.assertEqual(value['expectedGoalsPer90']['status'],'ESTIMATED')
        self.assertEqual(value['aerialWinPercentage']['value'],60)
        self.assertEqual(value['aerialWinPercentage']['attempts'],10)
        row['ss_minutesPlayed']='900'
        self.assertEqual(m.source_metrics((2,row,'ID'),profile(),{})['expectedGoalsPer90']['status'],'DERIVED')

    def test_partial_tracking_and_keeper_proxies_are_not_measurements(self):
        row={'season':'2526','team':'Example','ss_minutesPlayed':'900','ss_player_id':'1',
             'ss_kilometersCovered':'5','ss_numberOfSprints':'20','ss_saves':'30','ss_goalsConceded':'10',
             'ss_successfulRunsOut':'3','ss_goalsPrevented':'-2'}
        values=m.source_metrics((2,row,'ID'),profile(),{})
        self.assertNotIn('distanceKmPer90',values)
        self.assertNotIn('sprintsPer90',values)
        values=m.source_metrics((2,row,'ID'),profile(position='GK'),{})
        self.assertEqual(values['goalsPreventedPer90']['value'],-.2)
        self.assertEqual(values['savePercentage']['value'],75)
        self.assertEqual(values['savePercentage']['status'],'ESTIMATED')
        self.assertIn('PROXY',values['defensiveActionsOutsideBoxPer90']['basis'])

    def test_no_self_or_recursive_estimate_donors(self):
        target={**profile(1), 'values':{}, 'leagues':['Premier League']}
        donors=[]
        for i in range(2,14):
            donors.append({**profile(i),'values':{'progressivePassesPer90':m.metric(2,'ESTIMATED',
                'PERSONAL_CURRENT_DATAMB_RATE')},'leagues':['Premier League']})
        self.assertEqual(m.neighbours(target,donors,'progressivePassesPer90')[0],2)
        # Replacing one personal source with a peer prediction leaves <12 donors.
        donors[0]['values']['progressivePassesPer90']['basis']='SAME_POSITION_LEAGUE'
        self.assertIsNone(m.neighbours(target,donors+[target],'progressivePassesPer90'))
        self.assertFalse(m.reference_metric({'values':{'x':m.metric(3,'ESTIMATED','PERSONAL_PRIOR_ONLY')}},'x'))

    def test_identity_and_club_alias_require_independent_support(self):
        inputs=[profile(i) for i in range(1,4)]
        bundle={'clubs':[{'transfermarktId':10,'name':'Example FC','league':'Premier League'}],
                'players':[{'player':p['player'],'provenance':{'clubsDuringSeason':['10']}} for p in inputs]}
        rows=[{'league':'ENG-Premier League','season':'2526','team':'Different team alias',
               'player':p['player']['name'],'born':'2000','ss_minutesPlayed':'900',
               'ss_goals':'5','ss_appearances':'10'} for p in inputs]
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            (root/'data/supplemental-stats').mkdir(parents=True)
            (root/'data/stats-enrichment/reference').mkdir(parents=True)
            (root/'data/supplemental-stats/prepared.json').write_text(json.dumps({'clubEvidence':[]}))
            (root/'data/stats-enrichment/reference/reep-people.csv').write_text(
                'key_transfermarkt,date_of_birth,name,full_name,key_sofascore\n')
            with patch.object(m,'ROOT',root):
                current,*_=m.identities(inputs,bundle,rows,[])
                self.assertEqual(len(current),3)
                # Two anchors cannot invent a club alias.
                current,*_=m.identities(inputs,bundle,rows[:2],[])
                self.assertEqual(current,{})
                bad=copy.deepcopy(rows); bad[0]['born']='1990'
                current,*_=m.identities(inputs,bundle,bad,[])
                self.assertEqual(current,{})

    def test_constraints_reject_impossible_ratios(self):
        with self.assertRaises(AssertionError):
            m.validate_metrics({'savePercentage':m.metric(60,'ESTIMATED','TEST','PERCENT',successes=9,attempts=10)},['savePercentage'])
        with self.assertRaises(AssertionError):
            m.validate_metrics({'progressivePassesPer90':m.metric(10,'ESTIMATED','TEST'),
                                'passesCompletedPer90':m.metric(5,'DERIVED','TEST')},['progressivePassesPer90','passesCompletedPer90'])
        m.validate_metrics({'goalsPreventedPer90':m.metric(-.5,'DERIVED','TEST')},['goalsPreventedPer90'])


if __name__=='__main__': unittest.main()
