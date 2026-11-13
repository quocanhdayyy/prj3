"""Build versioned V3 inputs, never overwrite observations or invent verification.

The last-resort pressure/cross-stopping priors are declared assumptions for the
prototype, not measurements or an accuracy-calibrated statistical model.
"""
import argparse
import csv
import hashlib
import json
import math
import statistics
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data/v3-metrics'
METHOD = 'V3_PERSONAL_AND_NEIGHBOUR_INPUTS_V1'
SEASON = '2025/2026'
LEAGUES = {'ENG-Premier League': 'Premier League', 'ESP-La Liga': 'La Liga',
           'GER-Bundesliga': 'Bundesliga', 'ITA-Serie A': 'Serie A', 'FRA-Ligue 1': 'Ligue 1'}
OUTFIELD = ['goalsPer90', 'expectedGoalsPer90', 'assistsPer90', 'expectedAssistsPer90',
            'keyPassesPer90', 'progressivePassesPer90', 'progressiveCarriesPer90',
            'passesCompletedPer90', 'tacklesWonPer90', 'interceptionsPer90',
            'possessionAdjustedTacklesPer90', 'possessionAdjustedInterceptionsPer90',
            'aerialWinPercentage', 'pressuresPer90', 'pressureSuccessPercentage',
            'sprintsPer90', 'distanceKmPer90', 'attackingThirdRecoveriesPer90']
KEEPER = ['goalsPreventedPer90', 'savePercentage', 'crossStopPercentage',
          'defensiveActionsOutsideBoxPer90', 'passesCompletedPer90', 'progressivePassesPer90']
BASE = {'goalsPer90': 'goals', 'assistsPer90': 'assists', 'keyPassesPer90': 'keyPasses',
        'passesCompletedPer90': 'passesCompleted', 'tacklesWonPer90': 'tacklesWon',
        'interceptionsPer90': 'interceptions'}
FEATURE_SCALE = {'goalsPer90': .5, 'assistsPer90': .3, 'keyPassesPer90': 2,
                 'passesCompletedPer90': 40, 'tacklesWonPer90': 2, 'interceptionsPer90': 1.5}
PERCENTAGES = {'aerialWinPercentage', 'pressureSuccessPercentage', 'savePercentage', 'crossStopPercentage'}
ROLE = {'RB': 'FULLBACK', 'LB': 'FULLBACK', 'RW': 'WING', 'LW': 'WING', 'CM': 'MID', 'CDM': 'MID'}
PRESSURE_PRIOR = {'CB': 9, 'RB': 15, 'LB': 15, 'CDM': 19, 'CM': 19, 'CAM': 17, 'RW': 16, 'LW': 16, 'ST': 14}


def key(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', str(value)).casefold() if c.isalnum())


def number(value):
    try:
        v = float(value)
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None


def read_csv(file):
    with file.open(encoding='utf-8', newline='') as stream:
        return list(csv.DictReader(stream))


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def clamp(value, lo, hi):
    return max(lo, min(hi, value))


def metric(value, status, basis, unit='PER_90', **evidence):
    assert math.isfinite(value)
    return {'value': round(value, 6), 'unit': unit, 'status': status, 'basis': basis, **evidence}


def read_xlsx(path):
    ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    with zipfile.ZipFile(path) as z:
        strings = [''.join(t.text or '' for t in si.findall('.//s:t', ns))
                   for si in ET.fromstring(z.read('xl/sharedStrings.xml'))] if 'xl/sharedStrings.xml' in z.namelist() else []
        rows = []
        for row in ET.fromstring(z.read('xl/worksheets/sheet1.xml')).findall('.//s:sheetData/s:row', ns):
            values = {}
            for cell in row.findall('s:c', ns):
                v = cell.find('s:v', ns)
                value = v.text if v is not None else ''
                if cell.attrib.get('t') == 's': value = strings[int(value)]
                elif cell.attrib.get('t') == 'inlineStr': value = ''.join(t.text or '' for t in cell.findall('.//s:t', ns))
                values[''.join(c for c in cell.attrib['r'] if c.isalpha())] = value
            rows.append(values)
        header = rows[0]
        return [{header.get(k, k): v for k, v in r.items()} for r in rows[1:] if r.get('A')]


def load_sources(raw_dir):
    from importlib.util import spec_from_file_location, module_from_spec
    spec = spec_from_file_location('metric_sources', ROOT / 'scripts/fetch-v3-metric-sources.py')
    pinned = module_from_spec(spec); spec.loader.exec_module(pinned)
    manifest = json.loads((raw_dir.parent / 'sources.json').read_text())
    assert manifest['files'] == [{'file': f, 'url': u, 'sha256': s} for f,u,s in pinned.SOURCES], 'Unexpected source manifest'
    for entry in manifest['files']:
        assert hashlib.sha256((raw_dir / entry['file']).read_bytes()).hexdigest() == entry['sha256'], entry['file']
    meta = {e['file']: {'url': e['url'], 'sha256': e['sha256']} for e in manifest['files']}
    master = read_csv(raw_dir / 'player_seasons.csv')
    teams = read_csv(raw_dir / 'team_standard.csv')
    datamb = []
    for role in ['CB', 'FB', 'CM', 'FW', 'ST']:
        for row_number, row in enumerate(read_xlsx(raw_dir / (role + '.xlsx')), 2):
            datamb.append({**row, '_source': {**meta[role + '.xlsx'], 'row': row_number, 'positionSample': role}})
    return master, teams, datamb, meta, manifest


def identities(inputs, bundle, master, datamb):
    profiles = {p['player']['transfermarktId']: p for p in inputs}
    membership = {p['player']['transfermarktId']: set(p['provenance']['clubsDuringSeason']) for p in bundle['players']}
    club_map = defaultdict(set)
    for club in bundle['clubs']:
        club_map[key(club['name'])].add(str(club['transfermarktId']))
    club_evidence = json.loads((ROOT / 'data/supplemental-stats/prepared.json').read_text())
    for entry in club_evidence['clubEvidence']:
        if entry['league'] in LEAGUES: club_map[entry['sourceTeamKey']].add(str(entry['transfermarktClubId']))
    aliases = defaultdict(set)
    provider_ids = defaultdict(set)
    for tid, p in profiles.items(): aliases[key(p['player']['name'])].add(tid)
    bridge_file = ROOT / 'data/stats-enrichment/reference/reep-people.csv'
    for row in read_csv(bridge_file):
        tid = number(row['key_transfermarkt'])
        if tid is None or int(tid) not in profiles: continue
        tid = int(tid)
        if row['date_of_birth'] != profiles[tid]['player']['dateOfBirth']: continue
        for alias in [row['name'], row['full_name']]:
            if alias: aliases[key(alias)].add(tid)
        if row['key_sofascore']: provider_ids[int(row['key_sofascore'])].add(tid)
    # Resolve supplier club aliases using multiple independent, identity-checked
    # players. A familiar-looking team name alone is not enough to create a join.
    club_league = {str(c['transfermarktId']): c['league'] for c in bundle['clubs']}
    anchors = defaultdict(lambda: defaultdict(set))
    for row in master:
        if row['league'] not in LEAGUES or row['season'] != '2526': continue
        sid = number(row.get('ss_player_id'))
        ids = provider_ids.get(int(sid), set()) if sid is not None else set()
        if not ids: ids = aliases.get(key(row['player']), set())
        if len(ids) != 1: continue
        tid = next(iter(ids)); p = profiles[tid]; stats = p['stats']
        if number(row.get('born')) != int(p['player']['dateOfBirth'][:4]): continue
        minutes = number(row.get('ss_minutesPlayed'))
        if minutes is None or abs(minutes-stats['minutesPlayed']) > max(20,.25*stats['minutesPlayed']): continue
        if number(row.get('ss_goals')) != stats['goals'] or number(row.get('ss_appearances')) != stats['appearances']: continue
        for club in membership.get(tid,set()):
            if club_league.get(club) == LEAGUES[row['league']]: anchors[key(row['team'])][club].add(tid)
    club_proof = {}
    for team, votes in anchors.items():
        winners = [club for club,ids in votes.items() if len(ids)>=3]
        if len(winners) != 1: continue
        club = winners[0]
        if club_map.get(team) and club_map[team] != {club}: continue
        club_map[team].add(club)
        club_proof[team] = {'transfermarktClubId':club,'anchorTransfermarktIds':sorted(votes[club])}
    current = defaultdict(list)
    previous = defaultdict(list)
    rejected = Counter()
    for row_number, row in enumerate(master, 2):
        if row['league'] not in LEAGUES or row['season'] not in ['2425', '2526']: continue
        provider_id = number(row.get('ss_player_id'))
        ids = provider_ids.get(int(provider_id), set()) if provider_id is not None else set()
        basis = 'PROVIDER_ID_AND_VERIFIED_DOB'
        if not ids: ids, basis = aliases.get(key(row['player']), set()), 'UNIQUE_FULL_NAME_AND_CLUB'
        if len(ids) != 1: rejected['master_ambiguous_identity'] += 1; continue
        tid = next(iter(ids)); p = profiles[tid]; stats = p['stats']
        born = number(row.get('born'))
        if born is not None and int(born) != int(p['player']['dateOfBirth'][:4]): rejected['birth_year_mismatch'] += 1; continue
        minutes = number(row.get('ss_minutesPlayed')) or number(row.get('playing_time_min'))
        if not minutes or minutes <= 0: continue
        clubs = club_map.get(key(row['team']), set())
        if row['season'] == '2526':
            if not clubs.intersection(membership.get(tid, set())): rejected['master_club_mismatch'] += 1; continue
            if abs(minutes - stats['minutesPlayed']) > max(20, .25 * stats['minutesPlayed']): rejected['master_minutes_mismatch'] += 1; continue
            for col, field in [('ss_goals', 'goals'), ('ss_appearances', 'appearances')]:
                if number(row.get(col)) is not None and number(row[col]) != stats[field]: break
            else:
                current[tid].append((row_number, row, basis)); continue
            rejected['master_basic_totals_mismatch'] += 1
        elif basis == 'PROVIDER_ID_AND_VERIFIED_DOB' and minutes >= 450:
            previous[tid].append((row_number, row, basis))
    # A source with two stints must not be silently treated as the target full season.
    current = {tid: rows[0] for tid, rows in current.items() if len(rows) == 1}
    previous = {tid: rows[0] for tid, rows in previous.items() if len(rows) == 1}
    datamb_matches = defaultdict(list)
    by_club = defaultdict(list)
    for tid, clubs in membership.items():
        if tid in profiles:
            for club in clubs: by_club[club].append(tid)
    for row in datamb:
        clubs = club_map.get(key(row.get('Team within selected timeframe', '')), set())
        candidates = set(tid for club in clubs for tid in by_club.get(club, []))
        source_name = row['Player']; norm = key(source_name)
        words = source_name.split()
        age = number(row.get('Age')); minutes = number(row.get('Minutes played'))
        matches = []
        for tid in candidates:
            p = profiles[tid]; profile = p['player']
            exact = tid in aliases.get(norm, set())
            abbrev = False
            if len(words) > 1 and len(words[0].rstrip('.')) == 1:
                surname = key(' '.join(words[1:])); first = key(words[0])
                names = profile['name'].split()
                abbrev = bool(names and key(names[0]).startswith(first) and key(profile['name']).endswith(surname))
            if not (exact or abbrev): continue
            dob = profile['dateOfBirth']; age_at_end = 2026-int(dob[:4])-(dob[5:] > '06-30')
            if age is None or abs(age-age_at_end) > 1: continue
            if minutes is None or abs(minutes-p['stats']['minutesPlayed']) > max(25,.25*p['stats']['minutesPlayed']): continue
            matches.append((tid, 'UNIQUE_NAME_CLUB_AGE_MINUTES' if exact else 'UNIQUE_INITIAL_SURNAME_CLUB_AGE_MINUTES'))
        if len(matches) == 1:
            tid, basis = matches[0]; datamb_matches[tid].append((row, basis))
        elif candidates: rejected['datamb_unresolved_identity'] += 1
    return current, previous, datamb_matches, membership, club_map, rejected, club_proof


def source_metrics(entry, profile, source):
    """Read actual source totals with their own denominator, preserving provenance."""
    if not entry: return {}
    row_number, row, identity_basis = entry
    minutes = number(row.get('ss_minutesPlayed'))
    if not minutes or minutes <= 0: return {}
    current = row['season'] == '2526'
    close = abs(minutes-profile['stats']['minutesPlayed']) <= max(2, .01*profile['stats']['minutesPlayed'])
    status = 'DERIVED' if current and close else 'ESTIMATED'
    basis = 'PERSONAL_CURRENT_SOURCE_RATE' if current else 'PERSONAL_PREVIOUS_SEASON_RATE'
    proof = {'source': {**source, 'row': row_number, 'sourceSeason': row['season'], 'playerId': row.get('ss_player_id'),
                        'team': row['team'], 'minutes': minutes, 'identityBasis': identity_basis},
             'minuteAlignment': 'CLOSE' if close else 'DIFFERENT_PROVIDER_OR_SEASON'}
    result = {}
    fields = {'expectedGoalsPer90': 'ss_expectedGoals', 'expectedAssistsPer90': 'ss_expectedAssists',
              'attackingThirdRecoveriesPer90': 'ss_possessionWonAttThird', 'goalsPreventedPer90': 'ss_goalsPrevented',
              'sprintsPer90': 'ss_numberOfSprints', 'distanceKmPer90': 'ss_kilometersCovered'}
    for target, col in fields.items():
        v = number(row.get(col))
        if v is None: continue
        rate = v*90/minutes
        if target != 'goalsPreventedPer90' and rate < 0: continue
        if target in ['distanceKmPer90', 'sprintsPer90']:
            km = number(row.get('ss_kilometersCovered'))
            if profile['player']['position'] == 'GK' or km is None or not 5 <= km*90/minutes <= 15:
                continue  # Tracking totals can cover fewer matches than source minutes.
            if target == 'sprintsPer90' and rate > 80: continue
        result[target] = metric(rate, status, basis, definition=col, sourceTotal=v, **proof)
    if 'expectedGoalsPer90' not in result:
        xg, us_minutes = number(row.get('us_xg')), number(row.get('us_minutes'))
        if xg is not None and us_minutes and us_minutes > 0:
            result['expectedGoalsPer90'] = metric(xg*90/us_minutes, 'ESTIMATED', basis,
                definition='UNDERSTAT_XG', sourceTotal=xg, denominatorMinutes=us_minutes, **proof)
    won, lost = number(row.get('ss_aerialDuelsWon')), number(row.get('ss_aerialLost'))
    if won is not None and lost is not None and won+lost > 0:
        result['aerialWinPercentage'] = metric(100*won/(won+lost), status, basis, 'PERCENT',
            definition='AERIAL_DUELS_WON_OVER_WON_PLUS_LOST', successes=won, attempts=won+lost,
            countsMinutes=minutes, **proof)
    if profile['player']['position'] == 'GK':
        saves, conceded = number(row.get('ss_saves')), number(row.get('ss_goalsConceded'))
        if saves is not None and conceded is not None and saves+conceded > 0:
            result['savePercentage'] = metric(100*saves/(saves+conceded), 'ESTIMATED', 'PERSONAL_SAVE_DENOMINATOR_PROXY', 'PERCENT',
                definition='SAVES_OVER_SAVES_PLUS_CONCEDED_PROXY', successes=saves, attempts=saves+conceded,
                warning='Goals conceded may include own goals; explicit shots-on-target-faced is unavailable.', **proof)
        exits = number(row.get('ss_successfulRunsOut'))
        if exits is not None:
            result['defensiveActionsOutsideBoxPer90'] = metric(exits*90/minutes, 'ESTIMATED', 'PERSONAL_RUNS_OUT_PROXY',
                definition='SUCCESSFUL_RUNS_OUT_PROXY_NOT_VERIFIED_OUTSIDE_BOX', **proof)
    return result


def base_metrics(p):
    minutes = p['stats']['minutesPlayed']
    if minutes <= 0: return {}
    result = {}
    for field, col in BASE.items():
        v = p['stats'].get(col)
        if v is not None:
            result[field] = metric(v*90/minutes, 'DERIVED', 'EXISTING_OBSERVED_TOTAL',
                                   source={'table': 'player_stats', 'statsId': p['stats']['id'], 'field': col}, sourceTotal=v, denominatorMinutes=minutes)
        elif p.get('estimate') and col in p['estimate']['values']:
            v = p['estimate']['values'][col]
            result[field] = metric(v*90/minutes, 'ESTIMATED', 'EXISTING_SEPARATE_ESTIMATE',
                source={'table': 'player_stats_estimates', 'statsId': p['stats']['id'], 'method': p['estimate']['method']},
                sourceTotal=v, denominatorMinutes=minutes)
    return result


def distance(target, donor, field):
    common = []
    for feature, scale in FEATURE_SCALE.items():
        if feature == field: continue
        a, b = target['values'].get(feature), donor['values'].get(feature)
        if a and b:
            common.append(min(9, ((a['value']-b['value'])/scale)**2))
    if target['player']['height'] and donor['player']['height']:
        common.append(((target['player']['height']-donor['player']['height'])/10)**2)
    return math.sqrt(sum(common)/len(common)) if common else 1


def reference_metric(record, field):
    """Only personal source evidence may seed neighbours, never imputed values.

    A source's own per-90 rate can be used even when its minute definition differs
    from Transfermarkt. Such predictions retain ESTIMATED status in the target.
    """
    m = record['values'].get(field, {})
    if m.get('status') in ['OBSERVED', 'DERIVED']: return True
    return m.get('basis') in ['PERSONAL_CURRENT_DATAMB_RATE', 'PERSONAL_CURRENT_SOURCE_RATE',
                            'PERSONAL_SAVE_DENOMINATOR_PROXY', 'PERSONAL_RUNS_OUT_PROXY']


def neighbours(target, records, field):
    position = target['player']['position']; group = ROLE.get(position, position)
    candidates = [p for p in records if p['stats']['id'] != target['stats']['id'] and p['stats']['minutesPlayed'] >= 900
                  and reference_metric(p, field)]
    pools = [
        ('SAME_POSITION_LEAGUE', [p for p in candidates if p['player']['position'] == position and set(p['leagues']) & set(target['leagues'])]),
        ('SAME_POSITION_TOP5', [p for p in candidates if p['player']['position'] == position]),
        ('SAME_GROUP_LEAGUE', [p for p in candidates if ROLE.get(p['player']['position'],p['player']['position']) == group and set(p['leagues']) & set(target['leagues'])]),
        ('SAME_GROUP_TOP5', [p for p in candidates if ROLE.get(p['player']['position'],p['player']['position']) == group]),
    ]
    for basis, pool in pools:
        if len(pool) < 12: continue
        chosen = sorted(pool, key=lambda p: (distance(target,p,field),p['player']['id']))[:12]
        weights = [1/(.2+distance(target,p,field)) for p in chosen]
        prediction = sum(p['values'][field]['value']*w for p,w in zip(chosen,weights))/sum(weights)
        return prediction, {'basis': basis, 'donorPlayerIds': [p['player']['id'] for p in chosen], 'donorCount':len(pool),
                            'donorBases':dict(Counter(p['values'][field]['basis'] for p in chosen))}
    return None


def aerial_ratio_with_counts(value, position, minutes):
    """Keep unknown tiny samples missing instead of retaining an un-smoothable rate."""
    if 'attempts' in value or value.get('value') is None:
        return value
    attempts = round((5 if position == 'CB' else 2.5) * minutes / 90)
    if attempts <= 0:
        return {'value': None, 'unit': 'PERCENT', 'status': 'MISSING',
                'basis': 'INSUFFICIENT_EVIDENCE_OR_ZERO_DENOMINATOR',
                'prediction': value, 'countsMinutes': minutes,
                'warning': 'Modelled attempts round to zero; no usable rate or event counts.'}
    successes = round(attempts * clamp(value['value'], 0, 100) / 100)
    return metric(100 * successes / attempts, 'ESTIMATED', value['basis'], 'PERCENT',
                  prediction=value, successes=successes, attempts=attempts, countsMinutes=minutes,
                  warning='Counts are modelled jointly for smoothing; they are not observed aerial attempts.')


def validate_predictions(records):
    """Mask each sampled source metric and predict without the sampled player.

    This checks the neighbour method against supplier values, not scouting
    accuracy or the unmeasured pressure/cross-stopping assumptions.
    """
    results = {}
    fields = ['expectedGoalsPer90','expectedAssistsPer90','progressivePassesPer90',
              'progressiveCarriesPer90','aerialWinPercentage','sprintsPer90',
              'distanceKmPer90','attackingThirdRecoveriesPer90','goalsPreventedPer90','savePercentage']
    for field in fields:
        candidates = [p for p in records if p['stats']['minutesPlayed']>=900 and reference_metric(p,field)
                      and field in (KEEPER if p['player']['position']=='GK' else OUTFIELD)]
        sample = sorted(candidates,key=lambda p:digest([field,p['player']['id']]))[:40]
        errors=[];baseline=[];positions=Counter()
        for p in sample:
            target={**p,'values':{k:v for k,v in p['values'].items() if k!=field}}
            result=neighbours(target,records,field)
            if not result:continue
            predicted,_=result;actual=p['values'][field]['value']
            errors.append(abs(predicted-actual));positions[p['player']['position']]+=1
            peers=[q['values'][field]['value'] for q in candidates if q['player']['id']!=p['player']['id']
                   and q['player']['position']==p['player']['position']]
            if peers:baseline.append(abs(statistics.median(peers)-actual))
        results[field]={'tested':len(errors),'byPosition':dict(positions),
            'meanAbsoluteError':round(statistics.mean(errors),6) if errors else None,
            'positionMedianBaselineMAE':round(statistics.mean(baseline),6) if baseline else None}
    return {'protocol':'DETERMINISTIC_LEAVE_ONE_PLAYER_OUT_SOURCE_RATE_SAMPLE', 'sampleLimitPerMetric':40,
            'limitations':'Same-season supplier reference only. No measured validation for pressure, cross stops, sparse ST shares or transfer/scouting outcomes.',
            'metrics':results}


def prepare(snapshot, raw_dir):
    inputs = snapshot['inputs']
    bundle = json.loads((ROOT / 'data/transfermarkt/prepared.json').read_text())
    master, teams, datamb, meta, manifest = load_sources(raw_dir)
    current, previous, datamb_map, membership, club_map, rejected, club_proof = identities(inputs,bundle,master,datamb)
    clubs = {str(c['transfermarktId']): c for c in bundle['clubs']}
    possession = {}
    for row in teams:
        if row['season'] != '2526' or row['league'] not in LEAGUES: continue
        for club in club_map.get(key(row['team']), []):
            value = number(row.get('poss'))
            if value is not None and 0 < value < 100: possession[club] = value
    records = []
    for p in inputs:
        tid = p['player']['transfermarktId']; values = base_metrics(p)
        personal = source_metrics(current.get(tid),p,meta['player_seasons.csv'])
        for field,v in personal.items(): values.setdefault(field,v)
        progressive = defaultdict(list)
        for row,basis in datamb_map.get(tid,[]):
            for field,col in [('progressivePassesPer90','Accurate progressive passes per 90'),('progressiveCarriesPer90','Progressive runs per 90')]:
                v = number(row.get(col))
                if v is None or v < 0: continue
                mins = number(row['Minutes played'])
                status = 'OBSERVED' if abs(mins-p['stats']['minutesPlayed']) <= max(2,.01*p['stats']['minutesPlayed']) else 'ESTIMATED'
                progressive[field].append(metric(v,status,'PERSONAL_CURRENT_DATAMB_RATE',source=row['_source'],
                    sourceMinutes=mins,identityBasis=basis,definition=col,
                    sourcePassesCompletedPer90=number(row.get('Accurate passes per 90')),
                    warning='Provider per-90 with its own minute definition; rounded rate, not reconstructed season total.'))
        for field, found in progressive.items():
            # Duplicate positional samples are accepted only if the published numbers agree.
            if max(v['value'] for v in found)-min(v['value'] for v in found) <= .02: values[field]=found[0]
            else: rejected['datamb_conflicting_position_samples'] += 1
        member = membership.get(tid,set())
        record={**p,'values':values,'previous':source_metrics(previous.get(tid),p,meta['player_seasons.csv']),
                'leagues':sorted(set(clubs[c]['league'] for c in member if c in clubs)),
                'teamPossession':possession.get(next(iter(member))) if len(member)==1 else None}
        records.append(record)
    # Freeze personal source references before imputation, preventing self-training.
    donor_records = [{**p,'values':dict(p['values'])} for p in records]
    validation = validate_predictions(donor_records)
    fields_without_priors = [f for f in OUTFIELD+KEEPER if f not in [
        'possessionAdjustedTacklesPer90','possessionAdjustedInterceptionsPer90','pressuresPer90',
        'pressureSuccessPercentage','crossStopPercentage']]
    for target in records:
        required = KEEPER if target['player']['position']=='GK' else OUTFIELD
        if target['stats']['minutesPlayed'] <= 0:
            target['values'] = {field: {'value':None,'unit':'PERCENT' if field in PERCENTAGES else 'PER_90',
                'status':'MISSING','basis':'ZERO_MINUTES_NO_PER90'} for field in required}
            validate_metrics(target['values'],required)
            continue
        for field in dict.fromkeys(fields_without_priors):
            if field not in required or field in target['values']: continue
            result = neighbours(target,donor_records,field)
            prior = target['previous'].get(field)
            if result:
                predicted, proof = result
                if prior:
                    minutes=prior['source']['minutes'];weight=min(.65,minutes/(minutes+900))
                    predicted=weight*prior['value']+(1-weight)*predicted
                    proof={**proof,'priorWeight':weight,'priorEvidence':prior,'basis':'PERSONAL_PRIOR_SHRUNK_TO_NEIGHBOURS'}
                target['values'][field]=metric(predicted,'ESTIMATED',proof.pop('basis'),'PERCENT' if field in PERCENTAGES else 'PER_90',**proof)
            elif prior:
                target['values'][field]=metric(prior['value'],'ESTIMATED','PERSONAL_PRIOR_ONLY',prior['unit'],priorEvidence=prior)
        values=target['values'];minutes=target['stats']['minutesPlayed'];nineties=minutes/90
        if target['player']['position']!='GK':
            # ST has very sparse direct progressive-passing coverage. Estimate a
            # share of completed passes from the small measured ST sample, rather
            # than importing midfield volumes or choosing a desired player score.
            if 'progressivePassesPer90' not in values and 'passesCompletedPer90' in values:
                sample = [p for p in donor_records if p['player']['position']==target['player']['position']
                    and p['player']['id']!=target['player']['id'] and p['stats']['minutesPlayed']>=900
                    and p['values'].get('progressivePassesPer90',{}).get('basis')=='PERSONAL_CURRENT_DATAMB_RATE'
                    and (p['values']['progressivePassesPer90'].get('sourcePassesCompletedPer90')
                         or p['values'].get('passesCompletedPer90',{}).get('value') or 0)>0]
                if len(sample)>=5:
                    shares=[clamp(p['values']['progressivePassesPer90']['value']/
                        (p['values']['progressivePassesPer90'].get('sourcePassesCompletedPer90') or p['values']['passesCompletedPer90']['value']),0,1) for p in sample]
                    share=statistics.median(shares)
                    values['progressivePassesPer90']=metric(values['passesCompletedPer90']['value']*share,
                        'ESTIMATED','SPARSE_POSITION_MEDIAN_PASS_SHARE',medianShare=share,
                        donorPlayerIds=sorted(p['player']['id'] for p in sample),donorCount=len(sample),
                        inputMetric='passesCompletedPer90',
                        mixedProviderDenominators=any(not p['values']['progressivePassesPer90'].get('sourcePassesCompletedPer90') for p in sample),
                        warning='Sparse positional sample may overrepresent versatile players. Passing denominator can come from local per-90 when unavailable in the supplier table. Not accuracy-calibrated.')
            t=values.get('tacklesWonPer90',{}).get('value',0);i=values.get('interceptionsPer90',{}).get('value',0)
            # Explicit last-resort model assumptions, NOT observed pressures or validation.
            intensity=clamp(.75+.25*(t+i)/2.5,.65,1.35)
            pressure=PRESSURE_PRIOR[target['player']['position']]*intensity
            attempts=round(pressure*nineties)
            values['pressuresPer90']=metric(attempts/nineties,'ESTIMATED','POSITION_AND_DEFENSIVE_ACTIVITY_ASSUMPTION',
                attempts=attempts,countsMinutes=minutes,definition='MODELLED_PRESSURE_ATTEMPTS',
                warning='No measured current-season pressure feed. Position prior is a prototype assumption, not calibrated.',
                inputs={'positionPriorPer90':PRESSURE_PRIOR[target['player']['position']], 'tacklesPlusInterceptionsPer90':t+i})
            if attempts>0:
                proportion=clamp(.24+.015*(t+i-2.5),.18,.38);successes=round(attempts*proportion)
                values['pressureSuccessPercentage']=metric(100*successes/attempts,'ESTIMATED','PRESSURE_SUCCESS_ASSUMPTION','PERCENT',
                    successes=successes,attempts=attempts,countsMinutes=minutes,
                    warning='Both numerator and denominator are modelled; not actual pressure regains.')
            for field,base in [('possessionAdjustedTacklesPer90','tacklesWonPer90'),('possessionAdjustedInterceptionsPer90','interceptionsPer90')]:
                if base not in values: continue
                poss=target['teamPossession']
                # Normalize to a 50% out-of-possession opportunity share, not a provider-branded PAdj.
                if poss is not None:
                    factor=.5/(1-poss/100)
                    status='DERIVED' if values[base]['status'] in ['OBSERVED','DERIVED'] else 'ESTIMATED'
                    values[field]=metric(values[base]['value']*factor,status,'TEAM_SEASON_POSSESSION_NORMALISATION',
                        definition='PER90_TIMES_0.5_OVER_OPPONENT_POSSESSION_SHARE',teamPossessionPercentage=poss,
                        source=meta['team_standard.csv'],inputMetric=base,
                        warning='Team-season possession proxy, not possession while player was on pitch; differs from supplier PAdj definitions.')
                else:
                    values[field]=metric(values[base]['value'],'ESTIMATED','NEUTRAL_POSSESSION_ASSUMPTION',inputMetric=base,
                        teamPossessionPercentage=50,warning='No unambiguous single-club possession; neutral 50% is an assumption.')
        else:
            if 'progressivePassesPer90' not in values and 'passesCompletedPer90' in values:
                values['progressivePassesPer90']=metric(clamp(values['passesCompletedPer90']['value']*.12,0,6),
                    'ESTIMATED','KEEPER_PROGRESSIVE_PASS_SHARE_ASSUMPTION',assumedShare=.12,inputMetric='passesCompletedPer90')
            if 'defensiveActionsOutsideBoxPer90' not in values:
                values['defensiveActionsOutsideBoxPer90']=metric(.55,'ESTIMATED','KEEPER_OUTSIDE_BOX_ASSUMPTION',
                    warning='No measured outside-box action feed; prototype prior only.')
            height=target['player']['height'] or 190
            cross_rate=clamp(8+(height-190)*.2,3,16)
            crosses=round(12*nineties);stopped=round(crosses*cross_rate/100)
            if crosses>0:
                values['crossStopPercentage']=metric(100*stopped/crosses,'ESTIMATED','KEEPER_CROSS_STOP_ASSUMPTION','PERCENT',
                    successes=stopped,attempts=crosses,countsMinutes=minutes,
                    assumedCrossesFacedPer90=12,heightCm=height,
                    warning='Crosses faced/stopped are modelled, not inferred from high claims alone. No measured coverage.')
            if 'savePercentage' in values and 'attempts' not in values['savePercentage']:
                m=values['savePercentage'];attempts=round(5*nineties)
                if attempts>0:
                    successes=round(attempts*clamp(m['value'],0,100)/100)
                    values['savePercentage']=metric(100*successes/attempts,'ESTIMATED',m['basis'],'PERCENT',
                        prediction=m,successes=successes,attempts=attempts,countsMinutes=minutes,
                        assumedShotsOnTargetFacedPer90=5,
                        warning='Successes and attempts are modelled jointly; not measured shots faced.')
        # Constrain estimates while preserving any original observation.
        prog=values.get('progressivePassesPer90');passes=values.get('passesCompletedPer90')
        if prog and passes and prog['value']>passes['value']:
            values['progressivePassesPer90']=metric(passes['value'],'ESTIMATED','CONSISTENCY_CONSTRAINED',
                unconstrained=prog,upperBoundMetric='passesCompletedPer90')
        if 'aerialWinPercentage' in values and 'attempts' not in values['aerialWinPercentage']:
            values['aerialWinPercentage']=aerial_ratio_with_counts(values['aerialWinPercentage'],target['player']['position'],minutes)
        for field in list(values):
            if field not in required:del values[field]
        for field in required:
            if field not in values: values[field]={'value':None,'unit':'PERCENT' if field in PERCENTAGES else 'PER_90','status':'MISSING',
                'basis':'INSUFFICIENT_EVIDENCE_OR_ZERO_DENOMINATOR'}
        validate_metrics(values,required)
    source_hash=digest({'manifest':manifest,'preparerSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                        'bridgeSha256':hashlib.sha256((ROOT/'data/stats-enrichment/reference/reep-people.csv').read_bytes()).hexdigest(),
                        'clubEvidenceSha256':hashlib.sha256((ROOT/'data/supplemental-stats/prepared.json').read_bytes()).hexdigest(),
                        'inputHashes':[p['inputHash'] for p in inputs],
                        'cohortSha256':hashlib.sha256((ROOT/'data/transfermarkt/prepared.json').read_bytes()).hexdigest()})
    entries=[]
    for p in records:
        fields=KEEPER if p['player']['position']=='GK' else OUTFIELD
        entries.append({'statsId':p['stats']['id'],'method':METHOD,'inputHash':p['inputHash'],'sourceHash':source_hash,
            'values':p['values'],'evidence':{'season':SEASON,'playerId':p['player']['id'],'playerName':p['player']['name'],
                'position':p['player']['position'],'requiredMetrics':fields,'leagues':p['leagues'],
                'purpose':'V3_PROTOTYPE_INPUTS_NOT_VERIFIED_PERFORMANCE',
                'assumptions':['Pressure volume/success and goalkeeper cross stopping lack measured coverage and use explicit priors.',
                    'Team-season possession adjustment uses a declared proxy, not provider PAdj.',
                    'Different-provider minutes and previous-season evidence remain estimates.'],
                'coverage':dict(Counter(v['status'] for v in p['values'].values()))}})
    summary={'players':len(entries),'positions':dict(Counter(p['player']['position'] for p in records)),
             'byStatus':dict(Counter(v['status'] for e in entries for v in e['values'].values())),
             'byMetric':{f:dict(Counter(e['values'][f]['status'] for e in entries if f in e['values'])) for f in dict.fromkeys(OUTFIELD+KEEPER)},
             'currentPersonalMatches':len(current),'previousPersonalMatches':len(previous),'datambPlayerMatches':len(datamb_map),
             'identityRejections':dict(rejected), 'clubAliasEvidence':club_proof, 'sourceHash':source_hash,
             'byBasis':dict(Counter(v['basis'] for e in entries for v in e['values'].values())),
             'completePlayers':sum(all(v['value'] is not None for v in e['values'].values()) for e in entries)}
    return {'method':METHOD,'season':SEASON,'sourceHash':source_hash,'summary':summary,'validation':validation,'entries':entries}


def validate_metrics(values,required):
    for field in required:
        m=values[field];v=m['value']
        if v is None:assert m['status']=='MISSING';continue
        assert math.isfinite(v)
        if field in PERCENTAGES:assert 0<=v<=100,(field,v)
        elif field!='goalsPreventedPer90':assert v>=0,(field,v)
        if 'successes' in m:
            assert 0<=m['successes']<=m['attempts'] and m['attempts']>0
            assert abs(v-100*m['successes']/m['attempts'])<.00001
    prog=values.get('progressivePassesPer90',{}).get('value');passes=values.get('passesCompletedPer90',{}).get('value')
    if prog is not None and passes is not None:assert prog<=passes+.000001


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--snapshot',required=True);parser.add_argument('--output',required=True)
    args=parser.parse_args();result=prepare(json.loads(Path(args.snapshot).read_text()),DATA/'raw')
    Path(args.output).write_text(json.dumps(result,ensure_ascii=False,allow_nan=False,separators=(',',':')))
    print(json.dumps(result['summary'],ensure_ascii=False))
