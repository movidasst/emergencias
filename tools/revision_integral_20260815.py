from pathlib import Path
import re, subprocess, sys

p=Path('index.html')
html=p.read_text(encoding='utf-8')

# 1. Metadatos SEO + WhatsApp/Telegram/social preview.
head_pattern=re.compile(r'<meta content="#007b85" name="theme-color"/>.*?<title>.*?</title>',re.S)
seo='''<meta content="#007b85" name="theme-color"/>
<meta content="light" name="color-scheme"/>
<meta content="Herramienta guiada de La Movida de SST Plus para identificar amenazas, evaluar vulnerabilidad, construir escenarios de emergencia y analizar capacidades y brechas." name="description"/>
<meta content="La Movida de SST Plus" name="author"/>
<meta content="index,follow,max-image-preview:large" name="robots"/>
<meta content="La Movida de SST Plus · Emergencias" name="application-name"/>
<link href="https://emergencias.movidasst.com/" rel="canonical"/>
<link href="https://drive.google.com/thumbnail?id=1MjVa3JxeKC95xEdlcZ5ZFMCKlatbrU2s&amp;sz=w256" rel="icon"/>
<link href="https://drive.google.com/thumbnail?id=1MjVa3JxeKC95xEdlcZ5ZFMCKlatbrU2s&amp;sz=w512" rel="apple-touch-icon"/>
<meta content="website" property="og:type"/>
<meta content="es_VE" property="og:locale"/>
<meta content="La Movida de SST Plus" property="og:site_name"/>
<meta content="https://emergencias.movidasst.com/" property="og:url"/>
<meta content="Emergencias | La Movida de SST Plus" property="og:title"/>
<meta content="Identifica amenazas, evalúa vulnerabilidad y construye escenarios de emergencia con un flujo técnico guiado." property="og:description"/>
<meta content="https://drive.google.com/thumbnail?id=1MjVa3JxeKC95xEdlcZ5ZFMCKlatbrU2s&amp;sz=w1600&amp;v=20260815" property="og:image"/>
<meta content="https://drive.google.com/thumbnail?id=1MjVa3JxeKC95xEdlcZ5ZFMCKlatbrU2s&amp;sz=w1600&amp;v=20260815" property="og:image:secure_url"/>
<meta content="La Movida de SST Plus · De la reacción a la prevención" property="og:image:alt"/>
<meta content="summary_large_image" name="twitter:card"/>
<meta content="Emergencias | La Movida de SST Plus" name="twitter:title"/>
<meta content="Amenazas, vulnerabilidad y escenarios de emergencia en un flujo técnico guiado." name="twitter:description"/>
<meta content="https://drive.google.com/thumbnail?id=1MjVa3JxeKC95xEdlcZ5ZFMCKlatbrU2s&amp;sz=w1600&amp;v=20260815" name="twitter:image"/>
<title>Emergencias | La Movida de SST Plus</title>'''
html,n=head_pattern.subn(seo,html,count=1)
if n!=1: raise SystemExit('No se pudo actualizar el bloque SEO.')

# 2. Restaurar explicación metodológica por paso, sin volver a saturar la interfaz.
old='''    const guide=(id,step,title,objective,doText,result,statusText,statusClass,prev,next,nextLabel)=>{
      const el=$(`guide-${id}`);if(!el)return;
      el.innerHTML=`<div class="wg-top"><div><span class="wg-step">${esc(step)}</span><h3>${esc(title)}</h3></div><span class="wg-status ${statusClass}">${esc(statusText)}</span></div>`;
    };'''
new='''    const guide=(id,step,title,objective,doText,result,statusText,statusClass,prev,next,nextLabel)=>{
      const el=$(`guide-${id}`);if(!el)return;
      el.innerHTML=`
        <div class="wg-top"><div><span class="wg-step">${esc(step)}</span><h3>${esc(title)}</h3></div><span class="wg-status ${statusClass}">${esc(statusText)}</span></div>
        <p class="wg-objective">${esc(objective)}</p>
        <details class="step-methodology">
          <summary>Cómo trabajar este paso y criterio técnico</summary>
          <div class="method-grid">
            <div><b>Qué hacer</b><span>${esc(doText)}</span></div>
            <div><b>Para avanzar</b><span>${esc(result)}</span></div>
            <div><b>Resultado esperado</b><span>${esc(nextLabel)}</span></div>
          </div>
        </details>`;
    };'''
if old not in html: raise SystemExit('No se encontró el constructor de guía metodológica.')
html=html.replace(old,new,1)
html=html.replace('Falta de evidencia o información suficiente genera advertencias y no una falsa certeza.','Falta de información, justificación o datos suficientes genera advertencias y no una falsa certeza.')
html=html.replace('Elige amenaza y área, carga el instrumento, responde cada pregunta y justifica la condición observada. ','Elige la amenaza y el área. El instrumento se carga automáticamente; responde cada pregunta y justifica la condición observada.')
html=html.replace('Genera sugerencias o crea un escenario manual. Completa como mínimo: evento iniciador, elementos expuestos, evolución y consecuencias.','Construye el escenario de la amenaza evaluada. Completa como mínimo: evento iniciador, elementos expuestos, evolución y consecuencias.')

# 3. Metodología visible desde Inicio.
marker='    <div class="home-layout">'
home='''    <section class="panel methodology-home">
      <div class="method-home-head"><div><span class="eyebrow">Cómo funciona</span><h3>Metodología del análisis</h3></div><button class="btn outline" id="homeMethodologyBtn" type="button">Ver metodología completa</button></div>
      <p class="muted">Amenaza, vulnerabilidad y escenario no se trabajan como módulos aislados. La herramienta conserva una cadena técnica y trazable:</p>
      <div class="method-chain" aria-label="Secuencia metodológica"><span>Amenaza</span><i>→</i><span>Exposición</span><i>→</i><span>Vulnerabilidad</span><i>→</i><span>Escenario</span><i>→</i><span>Consecuencias</span><i>→</i><span>Capacidades</span><i>→</i><span>Brechas</span><i>→</i><span>Prioridad</span></div>
      <div class="callout"><b>Criterio:</b> la vulnerabilidad se evalúa frente a una amenaza concreta y sobre elementos expuestos concretos. Las capacidades de respuesta se analizan después, frente a la demanda del escenario.</div>
    </section>

    <div class="home-layout">'''
if marker not in html: raise SystemExit('No se encontró home-layout.')
html=html.replace(marker,home,1)

# 4. Metodología completa: conservar el razonamiento y hacerlo explícito.
method='''      <h3>1. Identificación y caracterización de amenazas</h3>
      <p class="muted">La amenaza describe el fenómeno, evento o condición con capacidad de generar daño. La aplicación permite asociarla a toda la sede o a un área concreta y exige caracterizar cómo puede presentarse: descripción específica, ocurrencia cualitativa, intensidad potencial, velocidad de desarrollo, antecedentes, señales y controles existentes.</p>
      <h3>2. Evaluación de vulnerabilidad</h3>
      <p class="muted">La vulnerabilidad no se interpreta como una debilidad genérica de la empresa. Se evalúa frente a una amenaza concreta y sobre el ámbito seleccionado. Las preguntas se valoran ordinalmente de 1 a 4 y requieren justificación. El promedio se conserva como información descriptiva, pero las reglas de síntesis evitan que una condición crítica quede diluida por valores menores.</p>
      <h3>3. Construcción de escenarios</h3>
      <p class="muted">El escenario no es sinónimo de amenaza. Describe una materialización plausible de la amenaza dadas la exposición y las vulnerabilidades identificadas. Debe documentar evento iniciador, condición operacional, elementos expuestos, evolución, escalamiento, cascadas o interdependencias, consecuencias y barreras críticas.</p>
      <h3>4. Consecuencias</h3>
      <p class="muted">Las consecuencias se documentan separadamente para personas, infraestructura, operaciones y ambiente/terceros. La valoración de impacto apoya la priorización y no constituye por sí sola una estimación probabilística.</p>
      <h3>5. Capacidades y brechas</h3>
      <p class="muted">La capacidad de respuesta se analiza después del escenario. Para cada capacidad se compara la demanda generada por el escenario con la capacidad realmente disponible. La diferencia se registra como brecha, con severidad, apoyo externo requerido y acción de mejora cuando corresponda.</p>
      <h3>6. Priorización y revisión profesional</h3>
      <p class="muted">La matriz integra amenaza, vulnerabilidad, consecuencias, potencial de la amenaza y brechas de capacidad. Los niveles obtenidos sirven para comparación y planificación; no representan una probabilidad matemática. Antes del informe, el profesional debe revisar y confirmar la matriz.</p>
      <h3>7. Calidad de la información</h3>
      <p class="muted">La ausencia de información, una justificación insuficiente o una condición que requiere estudio especializado debe mantenerse visible como advertencia. La herramienta no debe convertir datos incompletos en una falsa certeza.</p>'''
pat=re.compile(r'      <h3>Criterios de vulnerabilidad</h3>.*?      <h3>Priorización</h3>',re.S)
m=pat.search(html)
if m:
    html=html[:m.start()]+method+'\n      <h3>Priorización</h3>'+html[m.end():]
else:
    special='      <h3>Estudios especializados</h3>'
    if special not in html: raise SystemExit('No se encontró la sección metodológica completa.')
    html=html.replace(special,method+'\n'+special,1)

# 5. Flujo multiamenaza: no saltar a capacidades mientras falten vulnerabilidades/escenarios.
old_end='''    closeDrawer();await loadProjectContext();renderScenarioList();toast("Escenario guardado. Continúa con capacidades y brechas.");showPage("capabilities");
  }'''
new_end='''    closeDrawer();await loadProjectContext();renderScenarioList();renderAll();
    const pnow=getLocalProject();
    const nextVuln=(pnow?.selected_hazards||[]).find(h=>!h.vulnerability_completed_at);
    const withScenario=new Set((pnow?.scenarios||[]).map(s=>s.project_hazard_id));
    const nextScenario=(pnow?.selected_hazards||[]).find(h=>h.vulnerability_completed_at&&!withScenario.has(h.id));
    if(nextVuln){
      toast("Escenario guardado. Continúa con la vulnerabilidad de la siguiente amenaza.");
      showPage("vulnerability");setTimeout(()=>goHazardVulnerability(nextVuln.id),80);
    }else if(nextScenario){
      toast("Escenario guardado. Falta construir el escenario de otra amenaza evaluada.");
      showPage("scenarios");
    }else{
      toast("Escenarios completos. Continúa con capacidades y brechas.");
      showPage("capabilities");
    }
  }'''
if old_end not in html: raise SystemExit('No se encontró el cierre de saveScenario.')
html=html.replace(old_end,new_end,1)

# 6. Vincular metodología desde Inicio.
bind='    $("openMethodologyBtn").onclick = openMethodology;'
if bind not in html: raise SystemExit('No se encontró binding de metodología.')
html=html.replace(bind,bind+'\n    if($("homeMethodologyBtn")) $("homeMethodologyBtn").onclick = openMethodology;',1)
html=html.replace('Revisa la conexión en Más → Supabase.','No se pudo cargar el catálogo de capacidades. Recarga la aplicación; si persiste, verifica la conexión de datos.')

# 7. Estilos para explicación metodológica y legibilidad.
css='''
/* ===== REVISIÓN INTEGRAL UX / METODOLOGÍA ===== */
.wg-objective{margin:8px 0 0;color:var(--muted);font-size:11.5px;line-height:1.5}
.step-methodology{margin-top:9px;border-top:1px solid var(--line);padding-top:8px}
.step-methodology summary{cursor:pointer;color:var(--teal);font-size:10.5px;font-weight:800;list-style:none}
.step-methodology summary::-webkit-details-marker{display:none}.step-methodology summary:after{content:" +"}.step-methodology[open] summary:after{content:" −"}
.method-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:9px}.method-grid>div{padding:9px;border-radius:8px;background:#f8fafc;border:1px solid #e8eef2}
.method-grid b{display:block;color:var(--navy);font-size:9px;text-transform:uppercase;letter-spacing:.05em}.method-grid span{display:block;margin-top:3px;color:var(--muted);font-size:10px;line-height:1.45}
.methodology-home{margin:0 0 14px;border-top:4px solid var(--teal)}.method-home-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.method-home-head h3{margin:3px 0 0}
.method-chain{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:11px 0}.method-chain span{padding:5px 8px;border:1px solid #d8e7ea;background:#f3fafb;border-radius:999px;color:var(--navy);font-size:9.5px;font-weight:800}.method-chain i{font-style:normal;color:var(--teal);font-weight:900}
.panel,.card,.item,.analysis-main-card{transition:border-color .18s ease,box-shadow .18s ease,transform .18s ease}.analysis-main-card:hover,.analysis-main-card:focus-visible{border-color:#9bcfd3;box-shadow:0 12px 28px rgba(0,123,133,.10);transform:translateY(-1px)}
.btn:focus-visible,.iconbtn:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid rgba(0,123,133,.14);outline-offset:2px}.btn.primary{box-shadow:0 7px 18px rgba(0,123,133,.16)}
@media(max-width:760px){.method-grid{grid-template-columns:1fr}.method-home-head{flex-direction:column}.method-home-head .btn{width:100%}}
'''
html=html.replace('</style>',css+'\n</style>',1)

# 8. Marca de versión para comprobar qué publicación se está viendo.
html=html.replace('www.movidasst.com</a>\n    </footer>','www.movidasst.com</a><small style="display:block;margin-top:6px">Emergencias · versión 2026.08.15-r1</small>\n    </footer>',1)

# 9. Validaciones antes de escribir.
if 'type="file"' in html: raise SystemExit('La interfaz volvió a incluir carga de archivos.')
for required in ['function workflowStatus()','function saveAllVulnerabilityAndContinue()','function openManualScenarioForHazard(phId)','function saveScenario(id)','function editProject()','async function deleteProject()','function editArea(id)','async function deleteArea(id)','async function deleteScenario(id)','async function openMethodology()']:
    if required not in html: raise SystemExit('Falta función crítica: '+required)

p.write_text(html,encoding='utf-8')

# Extraer JavaScript inline y comprobar sintaxis real con Node.
scripts=re.findall(r'<script(?:\s[^>]*)?>(.*?)</script>',html,re.S|re.I)
js='\n'.join(s for s in scripts if s.strip())
tmp=Path('.revision_integral_check.js')
tmp.write_text(js,encoding='utf-8')
try:
    subprocess.run(['node','--check',str(tmp)],check=True)
finally:
    tmp.unlink(missing_ok=True)

print('REVISIÓN INTEGRAL OK')
