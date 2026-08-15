from pathlib import Path
import re
p=Path('index.html')
html=p.read_text(encoding='utf-8')
pat=re.compile(r'function projectVulnerabilityRows\(p=getLocalProject\(\)\)\{.*?(?=function buildLocalMatrix)',re.S)
fixed='''function projectVulnerabilityRows(p=getLocalProject()){if(!p)return[];const assessments=p.vulnerability_assessments||[],responses=p.vulnerability_responses||[];return assessments.map(a=>{const rr=responses.filter(r=>r.assessment_id===a.id&&!r.not_applicable),scores=rr.map(r=>Number(r.score||r.response_numeric||0)).filter(Boolean),ph=(p.selected_hazards||[]).find(x=>x.id===a.project_hazard_id),hazard=state.hazardCatalog.find(x=>x.id===ph?.hazard_id),area=(p.areas||[]).find(x=>x.id===a.area_id),criterion=state.vulnCriteria.find(x=>x.id===a.criterion_id),expected=(a.expected_question_ids||[]).length;return{id:a.id,project_hazard_id:a.project_hazard_id,area_id:a.area_id||null,hazard_name:hazard?.name_es||"Amenaza",area_name:area?.name||"Sede general",dimension_name:criterion?.name_es||criterion?.code||"Dimensión",vulnerability_level:vulnerabilityLevel(scores),average_score:scores.length?scores.reduce((s,n)=>s+n,0)/scores.length:null,max_score:scores.length?Math.max(...scores):null,responses_count:rr.length,expected_count:expected,incomplete:expected>0&&rr.length<expected,specialist_review_required:!!hazard?.requires_specialist_review}})}
'''
html,n=pat.subn(fixed,html,count=1)
if n!=1: raise SystemExit('No se encontró projectVulnerabilityRows para corregir.')
p.write_text(html,encoding='utf-8')
print('SINTAXIS BASE CORREGIDA')
