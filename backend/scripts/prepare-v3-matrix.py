"""Read the reviewed workbook and generate the versioned runtime matrix.

No workbook is changed and no third-party spreadsheet package is required.
Usage: python3 scripts/prepare-v3-matrix.py /path/to/weights.xlsx
"""
from pathlib import Path
import hashlib
import json
import math
import sys
import xml.etree.ElementTree as ET
import zipfile

FIELDS = dict(zip(
    ['G','xG','A','xA','K','PrgP','PrgC','P','T','I','PAdj-T','PAdj-I','Aerials Won %','Press/90','Press Succ %','Sprints/90','Dist/90','Att3rd Rec'],
    ['goalsPer90','expectedGoalsPer90','assistsPer90','expectedAssistsPer90','keyPassesPer90','progressivePassesPer90',
     'progressiveCarriesPer90','passesCompletedPer90','tacklesWonPer90','interceptionsPer90','possessionAdjustedTacklesPer90',
     'possessionAdjustedInterceptionsPer90','aerialWinPercentage','pressuresPer90','pressureSuccessPercentage','sprintsPer90',
     'distanceKmPer90','attackingThirdRecoveriesPer90']))
KEEPER = ['goalsPreventedPer90','savePercentage','crossStopPercentage','defensiveActionsOutsideBoxPer90','passesCompletedPer90','progressivePassesPer90']
NS = {'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def extract(file):
    with zipfile.ZipFile(file) as z:
        strings = [''.join(t.text or '' for t in s.findall('.//s:t',NS)) for s in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',NS)]
        rels = {r.attrib['Id']:r.attrib['Target'] for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
        sheet = next(s for s in ET.fromstring(z.read('xl/workbook.xml')).findall('s:sheets/s:sheet',NS) if s.attrib['name']=='Ma trận trọng số')
        target = rels[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
        target = target.lstrip('/') if target.startswith('/') else 'xl/'+target
        cells = {}
        for c in ET.fromstring(z.read(target)).findall('s:sheetData/s:row/s:c',NS):
            v=c.find('s:v',NS);value=v.text if v is not None else ''
            if c.attrib.get('t')=='s':value=strings[int(value)]
            if c.attrib.get('t')=='inlineStr':value=''.join(t.text or '' for t in c.findall('.//s:t',NS))
            cells[c.attrib['r']]=value
    return cells


def prepare(file):
    cells=extract(file);columns=[]
    for ref in cells:
        col=''.join(c for c in ref if c.isalpha())
        if ref==col+'5' and col not in ['A','B'] and cells[ref]:columns.append(col)
    if len(columns)!=33:
        raise ValueError('Workbook must contain exactly 33 outfield role columns')
    groups=['CB']*4+['FULLBACK']*5+['MIDFIELD']*8+['CAM']*3+['WING']*5+['ST']*8
    roles=[]
    for col,group in zip(columns,groups):
        name=cells[col+'5'];weights={FIELDS[cells['A'+str(i)]]:float(cells.get(col+str(i)) or 0) for i in range(7,25)}
        if any(not math.isfinite(w) or w<0 or w>1 for w in weights.values()):
            raise ValueError(f'{name}: weights must be finite and between 0 and 1')
        weights={k:v for k,v in weights.items() if v}
        if not math.isclose(sum(weights.values()),1,rel_tol=0,abs_tol=1e-10):
            raise ValueError(f'{name}: weights must sum to 100%')
        identifier='_'.join(name.upper().replace('-',' ').split())
        roles.append({'id':identifier,'name':name,'description':cells.get(col+'6',''),'group':group,'weights':weights})
    for col,identifier in [('C','TRADITIONAL_GK'),('D','SWEEPER_KEEPER')]:
        weights={key:float(cells[col+str(i)]) for key,i in zip(KEEPER,range(33,39))}
        if any(not math.isfinite(w) or w<0 or w>1 for w in weights.values()) or not math.isclose(sum(weights.values()),1,rel_tol=0,abs_tol=1e-10):
            raise ValueError(f'{identifier}: invalid goalkeeper weights')
        roles.append({'id':identifier,'name':cells[col+'31'],'description':cells[col+'32'],'group':'GK','weights':weights})
    if len({r['id'] for r in roles})!=35:
        raise ValueError('Role identifiers must be unique')
    sha=hashlib.sha256(file.read_bytes()).hexdigest()
    return {'version':'tactical-roles-v3-'+sha[:12],'sourceFile':file.name,'sourceSha256':sha,'roles':roles}


if __name__=='__main__':
    matrix=prepare(Path(sys.argv[1]))
    output=Path(__file__).resolve().parents[1]/'src/config/matching-v3-matrix.ts'
    output.write_text('// Generated from the reviewed workbook; regenerate with scripts/prepare-v3-matrix.py.\n'
                      +'export const v3Matrix = '+json.dumps(matrix,ensure_ascii=False,indent=2)+';\n')
    print(json.dumps({'roles':len(matrix['roles']),'version':matrix['version'],'output':str(output)}))
