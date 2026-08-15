from pathlib import Path
import re, subprocess

p=Path('index.html')
html=p.read_text(encoding='utf-8')

# --------------------------------------------------
# 1) SEO + previsualización WhatsApp / Telegram
# --------------------------------------------------
head=re.compile(r'<meta content="#007b85" name="theme-color"/>.*?<title>.*?</title>',re.S)
seo='''<meta content="#007b85" name="theme-color"/>
<meta content="light" name="color-scheme"/>
<meta content="Herramienta guiada de La Movida de SST Plus para identificar amenazas, evaluar vulnerabilidad, construir escenarios de emergencia y analizar capacidades y brechas." name="description"/>
<meta content="La Movida de SST Plus" name="author"/>
<meta content="index,follow,max-image-preview:large" name="robots"/>
<link href="https://emergencias.movidasst.com/" rel="canonical"/>
<link href="https://drive.google.com/thumbnail?id=1MjVa3JxeKC95xEdlcZ5ZFMCKlatbrU2s&amp;sz=w256" rel="icon"/>
<meta content="website" property="og:type"/>
<meta content="es_VE" property="og:locale"/>
<meta content="La Movida de SST Plus" property="og:site_name"/>
<meta content="https://emergencias.movidasst.com/" property="og:url"/>
<meta content="Emergencias | La Movida de SST Plus" property="og:title"/>
<meta content="Identifica amenazas, evalúa vulnerabilidad y construye escenarios de emergencia con un flujo técnico guiado." property="og:description"/>
<meta content="https://drive.google.com/thumbnail?id=1MjVa3JxeKC95xEdlcZ5ZFMCKlatbrU2s&amp;sz=w1600&amp;v=20260815r2" property="og:image"/>
<meta content="https://drive.google.com/thumbnail?id=1MjVa3JxeKC95xEdlcZ5ZFMCKlatbrU2s&amp;sz=w1600&amp;v=20260815r2" property="og:image:secure_url"/>
<meta content="La Movida de SST Plus · De la reacción a la prevención" property="og:image:alt"/>
<meta content="summary_large_image" name="twitter:card"/>
<meta content="Emergencias | La Movida de SST Plus" name="twitter:title"/>
<meta content="Amenazas, vulnerabilidad y escenarios de emergencia en un flujo técnico guiado." name="twitter:description"/>
<meta content="https://drive.google.com/thumbnail?id=1MjVa3JxeKC95xEdlcZ5ZFMCKlatbrU2s&amp;sz=w1600&amp;v=20260815r2" name="twitter:image"/>
<title>Emergencias | La Movida de SST Plus</title>'''
html,n=head.subn(seo,html,count=1)
if n!=1: raise SystemExit('SEO: no se encontró el bloque inicial.')

# --------------------------------------------------
# 2) Metodología visible en Inicio
# --------------------------------------------------
home_marker='<div class="home-layout">'
home='''<section class="panel methodology-home"><div class="method-home-head"><div><span class="eyebrow">Cómo funciona</span><h3>Metodología del análisis</h3></div><button class="btn outline" id="homeMethodologyBtn" type="button">Ver metodología completa</button></div><p class="muted">Amenaza, vulnerabilidad y escenario no son módulos aislados. El análisis conserva esta cadena técnica y trazable:</p><div class="method-chain"><span>Amenaza</span><i>→</i><span>Exposición</span><i>→</i><span>Vulnerabilidad</span><i>→</i><span>Escenario</span><i>→</i><span>Consecuencias</span><i>→</i><span>Capacidades</span><i>→</i><span>Brechas</span><i>→</i><span>Prioridad</span></div><div class="callout"><b>Principio rector:</b> la vulnerabilidad se evalúa frente a una amenaza concreta y sobre elementos expuestos concretos. La capacidad de respuesta se analiza después, frente a la demanda del escenario.</div></section><div class="home-layout">'''
if home_marker not in html: raise SystemExit('Inicio: no se encontró home-layout.')
html=html.replace(home_marker,home,1)

# --------------------------------------------------
# 3) Sustituir la guía mínima por una guía útil, breve y expandible
# --------------------------------------------------
workflow=re.compile(r'function renderWorkflowUX\(\)\{.*?\}\nfunction nextWorkflowAction',re.S)
new_workflow=r'''function renderWorkflowUX(){
 const st=workflowStatus(),p=getLocalProject(),started={project:!!p,hazards:(p?.selected_hazards||[]).length>0,vulnerability:(p?.vulnerability_responses||[]).length>0,scenarios:(p?.scenarios||[]).length>0,capabilities:(p?.capability_assessments||[]).length>0,matrix:(p?.scenarios||[]).length>0};
 ["project","hazards","vulnerability","scenarios","capabilities","matrix"].forEach(k=>{const c=routeClass(st[k],started[k]),e=$(`routeState-${k}`),m=$(`mainState-${k}`);if(e){e.className=`route-state ${c}`;e.textContent=routeLabel(st[k],started[k])}if(m){m.className=c;m.textContent=routeLabel(st[k],started[k])}});
 const g={
  project:{step:"Paso 01",title:"Datos del proyecto",objective:"Define el establecimiento, actividad y alcance del análisis.",doit:"Crea o selecciona el proyecto y agrega áreas solo cuando necesites diferenciar exposición o condiciones internas.",advance:"Proyecto con sede y actividad principal definidas.",result:"Contexto documentado."},
  hazards:{step:"Paso 02",title:"Identificación y caracterización de amenazas",objective:"Identifica qué fenómenos pueden afectar la sede y cómo podrían presentarse.",doit:"Selecciona la amenaza y el área. Caracteriza descripción específica, ocurrencia, intensidad, velocidad de desarrollo, antecedentes, señales y controles.",advance:st.details.hazards,result:"Amenazas aplicables y caracterizadas."},
  vulnerability:{step:"Paso 03",title:"Evaluación de vulnerabilidad",objective:"Evalúa la vulnerabilidad frente a cada amenaza concreta; no como una debilidad genérica de la empresa.",doit:"Selecciona amenaza y área. El instrumento se carga automáticamente. Valora cada pregunta de 1 a 4 y justifica la condición observada.",advance:st.details.vulnerability,result:"Vulnerabilidad documentada y trazable."},
  scenarios:{step:"Paso 04",title:"Construcción de escenarios",objective:"Un escenario no es la amenaza: describe cómo puede materializarse dadas la exposición y vulnerabilidad existentes.",doit:"Documenta evento iniciador, condición operacional, elementos expuestos, evolución, escalamiento, cascadas, consecuencias y barreras críticas.",advance:st.details.scenarios,result:"Escenarios plausibles y completos."},
  capabilities:{step:"Paso 05",title:"Capacidades y brechas",objective:"Compara lo que exige cada escenario con la capacidad real disponible.",doit:"Para cada capacidad registra demanda, capacidad disponible, brecha, severidad, apoyo externo y acción de mejora; o marca No aplica.",advance:st.details.capabilities,result:"Brechas de respuesta identificadas."},
  matrix:{step:"Paso 06",title:"Síntesis y priorización",objective:"Integra amenaza, vulnerabilidad, consecuencias y brechas sin convertir la escala en una probabilidad matemática.",doit:"Revisa resultados y confirma la matriz. Si cambias datos anteriores, vuelve a revisarla.",advance:st.details.matrix,result:"Matriz revisada para el informe."},
  report:{step:"Resultado",title:"Informe técnico",objective:"Documenta el análisis, metodología, resultados y limitaciones.",doit:"Actualiza la vista previa y genera el PDF cuando la matriz esté revisada.",advance:st.report?"Listo para informe":"Faltan etapas anteriores.",result:"Informe técnico trazable."}
 };
 Object.entries(g).forEach(([k,x])=>{const e=$(`guide-${k}`);if(!e)return;const done=!!st[k],active=started[k];e.innerHTML=`<div class="wg-top"><div><span class="wg-step">${x.step}</span><h3>${x.title}</h3></div><span class="wg-status ${done?"wg-done":active?"wg-progress":"wg-pending"}">${done?"Completo":active?"En curso":"Pendiente"}</span></div><p class="wg-objective">${x.objective}</p><details class="step-methodology"><summary>Cómo trabajar este paso y criterio técnico</summary><div class="method-grid"><div><b>Qué hacer</b><span>${x.doit}</span></div><div><b>Para avanzar</b><span>${x.advance}</span></div><div><b>Resultado esperado</b><span>${x.result}</span></div></div></details>`});
 const next=nextWorkflowAction(st),box=$("homeNext");if(box){box.innerHTML=`<strong>${esc(next.title)}</strong><span class="next-explain">${esc(next.detail)}</span><button class="btn" id="homeNextBtn">${esc(next.button)}</button>`;$("homeNextBtn").onclick=()=>navigateWorkflow(next.page)}
}
function nextWorkflowAction'''
html,n=workflow.subn(new_workflow,html,count=1)
if n!=1: raise SystemExit('Flujo: no se pudo reemplazar renderWorkflowUX.')

# --------------------------------------------------
# 4) Restaurar metodología completa en Más + acceso a etapas posteriores
# --------------------------------------------------
more=re.compile(r'<section class="page" id="page-more">.*?</section>\s*</main>',re.S)
more_html='''<section class="page" id="page-more"><div class="page-heading"><span class="eyebrow">Más opciones</span><h2>Metodología y soporte</h2><p>Consulta fundamentos técnicos y continúa con las etapas posteriores del análisis.</p></div><section class="panel"><span class="eyebrow">Continuación</span><h3>Etapas posteriores</h3><div class="actions"><button class="btn outline" data-more-go="capabilities">05 · Capacidades y brechas</button><button class="btn outline" data-more-go="matrix">06 · Matriz</button><button class="btn primary" data-more-go="report">Informe técnico</button></div></section><div class="grid g2 section-gap"><section class="panel"><h3>Metodología y fundamentos</h3><p class="muted">Incluye secuencia de análisis, criterios de vulnerabilidad, construcción de escenarios, consecuencias, capacidades, priorización, limitaciones, estudios especializados y fuentes registradas.</p><div class="actions"><button class="btn primary" id="openMethodologyBtn">Abrir metodología completa</button></div></section><section class="panel soft"><span class="eyebrow">La Movida de SST Plus</span><h3>De la reacción a la prevención</h3><p class="muted">www.movidasst.com</p></section></div></section></main>'''
html,n=more.subn(more_html,html,count=1)
if n!=1: raise SystemExit('Más: no se pudo restaurar la sección metodológica.')

# --------------------------------------------------
# 5) Restaurar formulario completo de escenarios
# --------------------------------------------------
scenario_form=re.compile(r'function scenarioForm\(s,options\)\{.*?\}\nfunction openManualScenarioForHazard',re.S)
scenario_form_new=r'''function scenarioForm(s,options){return`<label>Amenaza</label><select id="sfHazard">${options}</select><div class="grid g2"><div><label>Código *</label><input id="sfCode" value="${esc(s?.code||`ESC-${Date.now().toString().slice(-4)}`)}"></div><div><label>Título *</label><input id="sfTitle" value="${esc(s?.title||"")}"></div><div><label>Clase</label><select id="sfClass"><option value="base">Base</option><option value="severe">Severo</option><option value="maximum_credible">Máximo creíble</option></select></div></div><label>Evento iniciador *</label><textarea id="sfInit">${esc(s?.initiating_event||"")}</textarea><label>Condición operacional</label><textarea id="sfOp">${esc(s?.operational_condition||"")}</textarea><label>Elementos expuestos *</label><textarea id="sfExp">${esc(s?.exposed_elements||"")}</textarea><label>Evolución *</label><textarea id="sfEvol">${esc(s?.evolution||"")}</textarea><label>Escalamiento</label><textarea id="sfEsc">${esc(s?.escalation||"")}</textarea><label>Cascadas / interdependencias</label><textarea id="sfCas">${esc(s?.cascade_description||"")}</textarea><div class="grid g2"><div><label>Consecuencias en personas</label><textarea id="sfPeople">${esc(s?.consequence_people||"")}</textarea><label>Impacto personas</label><select id="sfPeopleLevel"><option value="0">Sin valorar</option><option value="1">1 · Menor</option><option value="2">2 · Moderado</option><option value="3">3 · Serio</option><option value="4">4 · Crítico</option></select></div><div><label>Infraestructura</label><textarea id="sfInfra">${esc(s?.consequence_infrastructure||"")}</textarea><label>Impacto infraestructura</label><select id="sfInfraLevel"><option value="0">Sin valorar</option><option value="1">1 · Menor</option><option value="2">2 · Moderado</option><option value="3">3 · Serio</option><option value="4">4 · Crítico</option></select></div><div><label>Operaciones</label><textarea id="sfOps">${esc(s?.consequence_operations||"")}</textarea><label>Impacto operacional</label><select id="sfOpsLevel"><option value="0">Sin valorar</option><option value="1">1 · Menor</option><option value="2">2 · Moderado</option><option value="3">3 · Serio</option><option value="4">4 · Crítico</option></select></div><div><label>Ambiente / terceros</label><textarea id="sfEnv">${esc(s?.consequence_environment||"")}</textarea><label>Impacto ambiente / terceros</label><select id="sfEnvLevel"><option value="0">Sin valorar</option><option value="1">1 · Menor</option><option value="2">2 · Moderado</option><option value="3">3 · Serio</option><option value="4">4 · Crítico</option></select></div></div><label>Barreras críticas</label><textarea id="sfBar">${esc(s?.critical_barriers||"")}</textarea><div class="actions"><button class="btn primary" id="saveScenarioBtn">Guardar escenario y continuar →</button></div>`}
function openManualScenarioForHazard'''
html,n=scenario_form.subn(scenario_form_new,html,count=1)
if n!=1: raise SystemExit('Escenarios: no se pudo restaurar scenarioForm.')

edit_scen=re.compile(r'function editScenario\(id\)\{.*?\}\nasync function saveScenario',re.S)
edit_new=r'''function editScenario(id){const s=state.scenarios.find(x=>x.id===id);if(!s)return;const options=state.selectedHazards.map(ph=>{const h=state.hazardCatalog.find(x=>x.id===ph.hazard_id);return`<option value="${ph.id}">${esc(h?.name_es||"Amenaza")}</option>`}).join("");drawer("Editar escenario",scenarioForm(s,options));$("sfHazard").value=s.project_hazard_id;$("sfClass").value=s.scenario_class||"base";$("sfPeopleLevel").value=String(s.consequence_people_level||0);$("sfInfraLevel").value=String(s.consequence_infrastructure_level||0);$("sfOpsLevel").value=String(s.consequence_operations_level||0);$("sfEnvLevel").value=String(s.consequence_environment_level||0);$("saveScenarioBtn").onclick=()=>saveScenario(id)}
async function saveScenario'''
html,n=edit_scen.subn(edit_new,html,count=1)
if n!=1: raise SystemExit('Escenarios: no se pudo restaurar editScenario.')

save_scen=re.compile(r'async function saveScenario\(id\)\{.*?\}\nasync function deleteScenario',re.S)
save_new=r'''async function saveScenario(id){const ph=state.selectedHazards.find(x=>x.id===$("sfHazard").value),payload={project_hazard_id:$("sfHazard").value,area_id:ph?.area_id||null,code:$("sfCode").value.trim(),title:$("sfTitle").value.trim(),scenario_class:$("sfClass").value,initiating_event:$("sfInit").value.trim(),operational_condition:$("sfOp").value.trim(),exposed_elements:$("sfExp").value.trim(),evolution:$("sfEvol").value.trim(),escalation:$("sfEsc").value.trim(),cascade_description:$("sfCas").value.trim(),consequence_people:$("sfPeople").value.trim(),consequence_infrastructure:$("sfInfra").value.trim(),consequence_operations:$("sfOps").value.trim(),consequence_environment:$("sfEnv").value.trim(),consequence_people_level:Number($("sfPeopleLevel").value||0),consequence_infrastructure_level:Number($("sfInfraLevel").value||0),consequence_operations_level:Number($("sfOpsLevel").value||0),consequence_environment_level:Number($("sfEnvLevel").value||0),critical_barriers:$("sfBar").value.trim()};if(!payload.project_hazard_id||!payload.code||!payload.title||!payload.initiating_event||!payload.exposed_elements||!payload.evolution)return toast("Completa amenaza, código, título, evento iniciador, elementos expuestos y evolución.");if(!(payload.consequence_people||payload.consequence_infrastructure||payload.consequence_operations||payload.consequence_environment))return toast("Describe al menos una consecuencia.");if(Math.max(payload.consequence_people_level,payload.consequence_infrastructure_level,payload.consequence_operations_level,payload.consequence_environment_level)<1)return toast("Valora el impacto de al menos una consecuencia.");mutateProject(p=>{if(id){const s=p.scenarios.find(x=>x.id===id);Object.assign(s,payload)}else p.scenarios.push({id:uid("sc"),...payload,created_at:new Date().toISOString()})});closeDrawer();await loadProjectContext();renderAll();const pnow=getLocalProject(),nextVuln=(pnow?.selected_hazards||[]).find(h=>!h.vulnerability_completed_at),withScenario=new Set((pnow?.scenarios||[]).map(s=>s.project_hazard_id)),nextScenario=(pnow?.selected_hazards||[]).find(h=>h.vulnerability_completed_at&&!withScenario.has(h.id));if(nextVuln){toast("Escenario guardado. Continúa con la vulnerabilidad de la siguiente amenaza.");showPage("vulnerability");setTimeout(()=>goHazardVulnerability(nextVuln.id),80)}else if(nextScenario){toast("Escenario guardado. Falta construir otro escenario.");showPage("scenarios")}else{toast("Escenarios completos. Continúa con capacidades y brechas.");showPage("capabilities")}}
async function deleteScenario'''
html,n=save_scen.subn(save_new,html,count=1)
if n!=1: raise SystemExit('Escenarios: no se pudo restaurar saveScenario.')

# --------------------------------------------------
# 6) Restaurar evaluación completa de capacidades
# --------------------------------------------------
cap=re.compile(r'async function loadCapabilityInstrument\(\)\{.*?\}\nasync function saveCapability\(sid,cid\)\{.*?\}\nfunction loadMatrix',re.S)
cap_new=r'''async function loadCapabilityInstrument(){const sid=$("capScenarioSelect").value;if(!sid)return toast("Selecciona un escenario.");const scenario=state.scenarios.find(s=>s.id===sid);if(!scenarioCompleteness(scenario).complete)return toast("Completa primero la estructura mínima del escenario.");if(!state.capabilities.length){$("capabilityInstrument").innerHTML='<div class="callout warn">No se pudo cargar el catálogo de capacidades. Recarga la aplicación.</div>';return}const p=getLocalProject(),existing=(p.capability_assessments||[]).filter(x=>x.scenario_id===sid),map=Object.fromEntries(existing.map(x=>[x.capability_id,x])),completed=new Set(existing.filter(x=>x.not_applicable||(String(x.required_capacity||"").trim()&&String(x.available_capacity||"").trim())).map(x=>x.capability_id)).size;$("capabilityInstrument").innerHTML=`<div class="callout good"><b>Avance:</b> ${completed}/${state.capabilities.length} capacidades revisadas. Revisa todas, aunque alguna sea No aplica.</div>`+state.capabilities.map(c=>{const x=map[c.id];return`<div class="item"><b>${esc(c.name_es||c.code)}</b><small>${esc(c.description_es||"")}</small><label style="display:flex;gap:8px;align-items:center"><input style="width:auto;min-height:auto" type="checkbox" id="cn-${c.id}" ${x?.not_applicable?'checked':''}> No aplica a este escenario</label><label>Demanda del escenario</label><textarea id="cd-${c.id}">${esc(x?.required_capacity||"")}</textarea><label>Capacidad disponible</label><textarea id="ca-${c.id}">${esc(x?.available_capacity||"")}</textarea><label>Descripción de la brecha</label><textarea id="cg-${c.id}">${esc(x?.gap_description||"")}</textarea><label>Severidad de brecha</label><select id="cs-${c.id}"><option value="">Sin brecha</option><option value="low">Baja</option><option value="moderate">Moderada</option><option value="high">Alta</option><option value="critical">Crítica</option></select><label>Tiempo crítico de respuesta</label><input id="ct-${c.id}" value="${esc(x?.critical_response_time||"")}"><label style="display:flex;gap:8px;align-items:center"><input style="width:auto;min-height:auto" type="checkbox" id="ce-${c.id}" ${x?.external_support_required?'checked':''}> Requiere apoyo externo</label><label>Acción de mejora</label><textarea id="ci-${c.id}">${esc(x?.improvement_action||"")}</textarea><div class="actions"><button class="btn primary" onclick="MovidaApp.saveCapability('${sid}','${c.id}')">Guardar capacidad</button></div></div>`}).join("");state.capabilities.forEach(c=>{const x=map[c.id];if(x?.gap_severity)$(`cs-${c.id}`).value=x.gap_severity})}
async function saveCapability(sid,cid){const na=$(`cn-${cid}`).checked,req=$(`cd-${cid}`).value.trim(),avail=$(`ca-${cid}`).value.trim(),sev=$(`cs-${cid}`).value;if(!na&&(!req||!avail))return toast("Describe demanda y capacidad disponible, o marca No aplica.");mutateProject(p=>{let x=(p.capability_assessments||[]).find(x=>x.scenario_id===sid&&x.capability_id===cid);if(!x){x={id:uid("ca"),scenario_id:sid,capability_id:cid};p.capability_assessments.push(x)}Object.assign(x,{not_applicable:na,required_capacity:na?"":req,available_capacity:na?"":avail,gap_exists:na?false:!!sev,gap_description:na?"":$(`cg-${cid}`).value.trim(),gap_severity:na?null:(sev||null),critical_response_time:na?"":$(`ct-${cid}`).value.trim(),external_support_required:na?false:$(`ce-${cid}`).checked,improvement_action:na?"":$(`ci-${cid}`).value.trim()})});await loadProjectContext();$("capScenarioSelect").value=sid;await loadCapabilityInstrument();renderWorkflowUX();toast(na?"Capacidad marcada como No aplica.":"Capacidad guardada.")}
function loadMatrix'''
html,n=cap.subn(cap_new,html,count=1)
if n!=1: raise SystemExit('Capacidades: no se pudo restaurar el instrumento completo.')

# --------------------------------------------------
# 7) Añadir metodología completa y bindings públicos
# --------------------------------------------------
method_fn=r'''async function openMethodology(){let refs=[];try{const r=await sb.from("references_catalog").select("*").eq("is_active",true).order("code");refs=r.data||[]}catch(e){}drawer("Metodología, razonamiento y fuentes",`<div class="callout good"><b>Principio rector:</b> la vulnerabilidad se evalúa frente a una amenaza concreta y sobre elementos expuestos concretos. La capacidad de respuesta se analiza después.</div><h3>Secuencia utilizada</h3><p class="muted"><b>Contexto → Amenaza → Exposición → Vulnerabilidad → Escenario → Consecuencias → Demanda → Capacidad → Brecha → Priorización → Acción → Validación.</b></p><h3>1. Identificación y caracterización de amenazas</h3><p class="muted">La amenaza describe el fenómeno, evento o condición con capacidad de generar daño. Se asocia a toda la sede o a un área concreta y se caracteriza mediante descripción específica, ocurrencia cualitativa, intensidad potencial, velocidad de desarrollo, antecedentes, señales y controles.</p><h3>2. Evaluación de vulnerabilidad</h3><p class="muted">La vulnerabilidad no es una debilidad genérica. Se evalúa frente a una amenaza concreta y sobre el ámbito seleccionado. Las preguntas se valoran de 1 a 4 y requieren justificación. Una condición crítica no debe quedar diluida por el promedio.</p><h3>3. Construcción de escenarios</h3><p class="muted">El escenario no es sinónimo de amenaza. Describe una materialización plausible dadas la exposición y las vulnerabilidades: evento iniciador, condición operacional, elementos expuestos, evolución, escalamiento, cascadas, consecuencias y barreras críticas.</p><h3>4. Consecuencias</h3><p class="muted">Se documentan para personas, infraestructura, operaciones y ambiente/terceros. Su valoración apoya la priorización y no equivale a una probabilidad matemática.</p><h3>5. Capacidades y brechas</h3><p class="muted">Para cada escenario se compara la demanda con la capacidad realmente disponible. La diferencia se registra como brecha, con severidad, apoyo externo y acción de mejora.</p><h3>6. Priorización</h3><p class="muted">La matriz integra amenaza, vulnerabilidad, consecuencias, potencial de la amenaza y brechas. Sirve para comparación y planificación; no representa probabilidad matemática.</p><h3>7. Calidad de la información y límites</h3><p class="muted">Información insuficiente o una condición que requiere estudio especializado debe quedar visible como advertencia. La herramienta no sustituye evaluación estructural, modelación de incendios/explosiones, dispersión química, estudios hidrológicos/geotécnicos, ingeniería eléctrica, ciberseguridad u otras disciplinas especializadas.</p><h3>Fuentes registradas</h3><div class="list">${refs.length?refs.map(r=>`<div class="item"><b>${esc(r.code)} · ${esc(r.title)}</b><small>${esc(r.publisher||"")} · ${esc(r.jurisdiction||"")}</small><small>${esc(r.notes||"")}</small></div>`).join(""):'<div class="empty">No se pudieron cargar referencias.</div>'}</div>`)}
'''
anchor='function goHazardVulnerability'
if anchor not in html: raise SystemExit('Metodología: no se encontró punto de inserción.')
html=html.replace(anchor,method_fn+anchor,1)

# Bindings dentro de bindEvents.
bind_anchor='$("brandHome").onclick=e=>{e.preventDefault();showPage("home")};'
if bind_anchor not in html: raise SystemExit('Bindings: no se encontró brandHome.')
html=html.replace(bind_anchor,bind_anchor+'if($("methodBtn"))$("methodBtn").onclick=openMethodology;if($("openMethodologyBtn"))$("openMethodologyBtn").onclick=openMethodology;if($("homeMethodologyBtn"))$("homeMethodologyBtn").onclick=openMethodology;',1)
# Botones de Más.
html=html.replace('document.querySelectorAll("[data-main-go]").forEach(b=>b.onclick=()=>navigateWorkflow(b.dataset.mainGo))','document.querySelectorAll("[data-main-go]").forEach(b=>b.onclick=()=>navigateWorkflow(b.dataset.mainGo));document.querySelectorAll("[data-more-go]").forEach(b=>b.onclick=()=>navigateWorkflow(b.dataset.moreGo))',1)

# --------------------------------------------------
# 8) Estilos y versión visible
# --------------------------------------------------
css='''\n/* ===== REVISIÓN INTEGRAL UX / METODOLOGÍA ===== */\n.wg-objective{margin:8px 0 0;color:var(--muted);font-size:11.5px;line-height:1.5}.step-methodology{margin-top:9px;border-top:1px solid var(--line);padding-top:8px}.step-methodology summary{cursor:pointer;color:var(--teal);font-size:10.5px;font-weight:800;list-style:none}.step-methodology summary::-webkit-details-marker{display:none}.step-methodology summary:after{content:" +"}.step-methodology[open] summary:after{content:" −"}.method-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:9px}.method-grid>div{padding:9px;border-radius:8px;background:#f8fafc;border:1px solid #e8eef2}.method-grid b{display:block;color:var(--navy);font-size:9px;text-transform:uppercase;letter-spacing:.05em}.method-grid span{display:block;margin-top:3px;color:var(--muted);font-size:10px;line-height:1.45}.methodology-home{margin:0 0 14px;border-top:4px solid var(--teal)}.method-home-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.method-home-head h3{margin:3px 0 0}.method-chain{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:11px 0}.method-chain span{padding:5px 8px;border:1px solid #d8e7ea;background:#f3fafb;border-radius:999px;color:var(--navy);font-size:9.5px;font-weight:800}.method-chain i{font-style:normal;color:var(--teal);font-weight:900}.more-analysis-grid{display:grid;gap:8px;margin-top:10px}@media(max-width:760px){.method-grid{grid-template-columns:1fr}.method-home-head{flex-direction:column}.method-home-head .btn{width:100%}}\n'''
html=html.replace('</style>',css+'</style>',1)
html=html.replace('LA MOVIDA DE SST PLUS · De la reacción a la prevención · www.movidasst.com</footer>','LA MOVIDA DE SST PLUS · De la reacción a la prevención · www.movidasst.com<br><small>Emergencias · versión 2026.08.15-r2</small></footer>',1)

# --------------------------------------------------
# 9) Verificaciones de integridad
# --------------------------------------------------
required=['function workflowStatus()','function renderWorkflowUX()','function saveAllVulnerabilityAndContinue()','function scenarioForm(s,options)','async function saveScenario(id)','async function loadCapabilityInstrument()','async function saveCapability(sid,cid)','async function openMethodology()','function editProject()','async function deleteProject()','function editArea(id)','async function deleteArea(id)','async function deleteScenario(id)']
for x in required:
    if x not in html: raise SystemExit('Falta función crítica: '+x)
if 'type="file"' in html: raise SystemExit('Se reintrodujo carga de archivos.')
if 'property="og:title"' not in html or 'property="og:image"' not in html: raise SystemExit('Faltan metadatos sociales.')
if 'Cómo trabajar este paso y criterio técnico' not in html: raise SystemExit('No se restauró explicación por paso.')

p.write_text(html,encoding='utf-8')

scripts=re.findall(r'<script(?:\s[^>]*)?>(.*?)</script>',html,re.S|re.I)
js='\n'.join(s for s in scripts if s.strip())
tmp=Path('.revision_check.js');tmp.write_text(js,encoding='utf-8')
try: subprocess.run(['node','--check',str(tmp)],check=True)
finally: tmp.unlink(missing_ok=True)
print('REVISION INTEGRAL R2 OK')
