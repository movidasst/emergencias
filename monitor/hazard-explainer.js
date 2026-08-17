/* Explicación operativa de señales: qué es, qué significa el nivel y qué implica para SST. */
(() => {
  const baseRender = render;
  const baseImpactDetail = renderImpactDetail;
  const oldImpactLabel = impactLabel;

  function safe(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  function str(v){return String(v??'').trim()}
  function hay(x){return [x?.title,x?.desc,x?.source,x?.country,JSON.stringify(x?.raw||{})].join(' ')}
  function isGdacs(x){return /GDACS|Global Disaster Awareness/i.test(hay(x)) || /\b(green|orange|red)\s+(flood|earthquake|tropical cyclone|forest fire|eruption|tsunami)/i.test(x?.title||'')}
  function gdacsLevel(x){
    const s=hay(x).toLowerCase();
    if(/\bred\b/.test(s))return 'red';
    if(/\borange\b/.test(s))return 'orange';
    if(/\bgreen\b/.test(s))return 'green';
    return null;
  }
  function levelEs(level){return level==='red'?'Rojo':level==='orange'?'Naranja':level==='green'?'Verde':'No indicado'}
  function levelClass(level){return level==='red'?'red':level==='orange'?'orange':level==='green'?'green':'neutral'}

  function spanishCountry(v){
    return String(v||'').replace(/^Venezuela$/i,'Venezuela');
  }
  function displayTitle(x){
    const t=str(x?.title);
    let m=t.match(/^(Green|Orange|Red)\s+flood(?:\s+alert)?\s+in\s+(.+)$/i);
    if(m)return `Alerta ${levelEs(m[1].toLowerCase()).toLowerCase()} GDACS por inundación en ${spanishCountry(m[2])}`;
    m=t.match(/^(Green|Orange|Red)\s+earthquake(?:\s+alert)?\s+in\s+(.+)$/i);
    if(m)return `Alerta ${levelEs(m[1].toLowerCase()).toLowerCase()} GDACS por terremoto en ${spanishCountry(m[2])}`;
    m=t.match(/^(Green|Orange|Red)\s+tropical cyclone(?:\s+alert)?\s+(.+)$/i);
    if(m)return `Alerta ${levelEs(m[1].toLowerCase()).toLowerCase()} GDACS por ciclón tropical · ${m[2]}`;
    m=t.match(/^(Green|Orange|Red)\s+forest fires?\s+in\s+(.+)$/i);
    if(m)return `Alerta ${levelEs(m[1].toLowerCase()).toLowerCase()} GDACS por incendio forestal en ${m[2]}`;
    m=t.match(/^(Green|Orange|Red)\s+tsunami(?:\s+alert)?\s+in\s+(.+)$/i);
    if(m)return `Alerta ${levelEs(m[1].toLowerCase()).toLowerCase()} GDACS por tsunami en ${m[2]}`;
    return t
      .replace(/\bGreen flood alert\b/ig,'Alerta verde por inundación')
      .replace(/\bOrange flood alert\b/ig,'Alerta naranja por inundación')
      .replace(/\bRed flood alert\b/ig,'Alerta roja por inundación')
      .replace(/\bin Venezuela\b/ig,'en Venezuela');
  }

  function gdacsFlood(level){
    if(level==='green')return {
      headline:'INUNDACIÓN REGISTRADA · NIVEL GDACS VERDE',
      meaning:'GDACS ha registrado un evento de inundación y lo clasifica en su nivel humanitario global más bajo. Para inundaciones, Verde agrupa los eventos que no alcanzan los umbrales de Naranja o Rojo en la información utilizada por GDACS.',
      notMeans:'No significa “sin peligro”, “sin inundación” ni “nivel de agua bajo”. El color GDACS clasifica impacto humanitario a escala global; no sustituye la situación hidrológica local.',
      reference:'Referencia GDACS para inundaciones: Verde = resto de eventos; Naranja = más de 100 fallecidos o 80.000 desplazados; Rojo = más de 1.000 fallecidos o 800.000 desplazados.',
      sst:'Para SST, la pregunta correcta es si esa inundación coincide con trabajadores, instalaciones, vías de acceso, zonas bajas, drenajes, servicios o rutas utilizadas por la organización.'
    };
    if(level==='orange')return {
      headline:'INUNDACIÓN · NIVEL GDACS NARANJA',
      meaning:'GDACS asigna nivel Naranja a una inundación con impacto humanitario internacional considerable según la información que utiliza para clasificar el evento.',
      notMeans:'No es una medición de profundidad del agua ni una orden automática de evacuación para tu empresa. Debe localizarse el área realmente afectada y contrastarse con autoridades nacionales y locales.',
      reference:'En el modelo GDACS de inundaciones, Naranja corresponde a más de 100 fallecidos o 80.000 desplazados; Rojo se reserva para más de 1.000 fallecidos o 800.000 desplazados.',
      sst:'Elevar verificación de personal, sedes, accesos, transporte, energía, abastecimiento y continuidad en las zonas coincidentes con el evento.'
    };
    if(level==='red')return {
      headline:'INUNDACIÓN · NIVEL GDACS ROJO',
      meaning:'GDACS clasifica el evento en su nivel humanitario global más alto para inundaciones.',
      notMeans:'El color no describe por sí solo la profundidad del agua en una ubicación concreta ni confirma que una sede específica esté afectada.',
      reference:'Para inundaciones, GDACS utiliza Rojo cuando la información supera 1.000 fallecidos o 800.000 desplazados.',
      sst:'Tratar como señal de verificación prioritaria: confirmar exposición de trabajadores e instalaciones, accesos, evacuación, logística, servicios críticos y continuidad con información oficial local.'
    };
    return null;
  }

  function gdacsEq(level){
    const textBy={
      green:'El nivel Verde corresponde a un puntaje GDACS de 0–1 y representa menor probabilidad de impacto humanitario internacional según su modelo.',
      orange:'El nivel Naranja corresponde a un puntaje GDACS de 1–2: requiere mayor atención humanitaria según intensidad, población expuesta y capacidad de respuesta.',
      red:'El nivel Rojo corresponde a un puntaje GDACS de 2 o más y representa la mayor prioridad humanitaria de su escala.'
    };
    return {headline:`TERREMOTO · NIVEL GDACS ${levelEs(level).toUpperCase()}`,meaning:textBy[level]||'GDACS clasifica el terremoto mediante intensidad, población expuesta y capacidad de respuesta.',notMeans:'No es una evaluación estructural de edificios ni significa que todas las instalaciones del país tengan ese nivel de daño.',reference:'GDACS combina Shakemap/intensidad, población expuesta y capacidad de respuesta del país. El tsunami, si existe, se evalúa por separado.',sst:'Verificar intensidad y daños reportados en la ubicación real de trabajadores/sedes; aplicar inspección post-sismo, control de reingreso, comunicaciones y continuidad según condiciones locales.'};
  }
  function gdacsStorm(level){
    return {headline:`CICLÓN TROPICAL · NIVEL GDACS ${levelEs(level).toUpperCase()}`,meaning:'El nivel GDACS para ciclones combina peligro por viento, población expuesta y vulnerabilidad del territorio.',notMeans:'No equivale automáticamente a una categoría Saffir-Simpson ni confirma afectación en una sede específica. La marejada ciclónica tiene una evaluación separada.',reference:'GDACS utiliza una matriz de viento, población y vulnerabilidad para asignar Verde/Naranja/Rojo.',sst:'Revisar trayectoria prevista, viento, lluvia, marejada, tareas exteriores, techos, izajes, rutas, energía de respaldo y comunicación con personal móvil.'};
  }
  function gdacsTsunami(level){
    const ref=level==='red'?'Rojo: altura máxima estimada en costa ≥3 m.':level==='orange'?'Naranja: altura máxima estimada en costa entre 1 y 3 m.':level==='green'?'Verde: altura máxima estimada en costa de 0 a 1 m.':'GDACS clasifica tsunami según altura máxima estimada en costa.';
    return {headline:`TSUNAMI · NIVEL GDACS ${levelEs(level).toUpperCase()}`,meaning:`GDACS usa escenarios de propagación y altura máxima estimada en costa. ${ref}`,notMeans:'No sustituye los avisos de los centros oficiales de tsunami ni describe la altura exacta que ocurrirá en cada playa, puerto o instalación costera.',reference:'Escala GDACS tsunami: Verde 0–1 m; Naranja 1–3 m; Rojo ≥3 m de altura máxima estimada en costa.',sst:'Para instalaciones o trabajadores costeros, verificar avisos oficiales, cota/altura, rutas de evacuación vertical u horizontal, puertos, accesos y zonas de reunión.'};
  }
  function gdacsWildfire(level){
    return {headline:`INCENDIO FORESTAL · NIVEL GDACS ${levelEs(level).toUpperCase()}`,meaning:level==='green'?'GDACS puede asignar Verde a incendios de al menos 5.000 ha incluso sin impactos confirmados, o a eventos menores con impactos/preparación limitada.':level==='orange'?'Naranja indica impacto directo sobre personas o áreas construidas en la clasificación GDACS.':'Rojo se reserva para incendios con impactos severos sobre personas y bienes.',notMeans:'El nivel GDACS no es una medición de humo, temperatura ni exposición ocupacional.',reference:'La clasificación de incendios de GDACS combina extensión e impacto observado/esperado sobre personas y bienes.',sst:'Verificar humo, calidad del aire, trabajadores exteriores, instalaciones, combustibles, rutas, visibilidad y evolución del incendio con fuentes locales y satelitales.'};
  }
  function gdacsVolcano(level){
    return {headline:`ACTIVIDAD VOLCÁNICA · NIVEL GDACS ${levelEs(level).toUpperCase()}`,meaning:level==='green'?'Verde puede indicar un aumento significativo de emisión de ceniza o de actividad volcánica reportada por fuentes especializadas.':'Naranja/Rojo se asignan cuando el evento alcanza una relevancia humanitaria mayor.',notMeans:'No es por sí solo una medición de concentración de ceniza ni exposición respiratoria en un puesto de trabajo.',reference:'GDACS integra información de VAAC y Smithsonian para actividad volcánica.',sst:'Verificar ceniza, aire, visibilidad, rutas, vuelos, maquinaria sensible, ventilación y protección respiratoria según mediciones y boletines oficiales.'};
  }

  function genericMeaning(x,kind){
    const map={
      flood:{headline:'SEÑAL DE INUNDACIÓN',meaning:'La fuente reporta o detecta un evento de inundación. La utilidad operativa depende de ubicar el río, cuenca, municipio o polígono realmente afectado y conocer su evolución.',notMeans:'Una señal de inundación no confirma que una empresa, carretera o trabajador específico esté bajo agua.',sst:'Cruzar la zona reportada con sedes, trabajadores en campo, rutas, zonas bajas, drenajes, servicios y accesos.'},
      earthquake:{headline:'SEÑAL SÍSMICA',meaning:'Se ha detectado un terremoto/sismo. La magnitud describe el tamaño del evento; el efecto en una sede depende de distancia, profundidad, suelo e intensidad local.',notMeans:'Magnitud no equivale directamente a daño ni a intensidad en tu instalación.',sst:'Confirmar intensidad local, daños observables, comunicaciones, evacuación y criterios seguros de reingreso.'},
      storm:{headline:'SEÑAL DE CICLÓN / TORMENTA',meaning:'La fuente reporta un ciclón o tormenta que puede producir viento, lluvia intensa, inundación y, en costas, marejada.',notMeans:'La existencia del sistema no confirma que todas las zonas del país estén expuestas por igual.',sst:'Revisar trayectoria, radio de vientos, lluvia, trabajos exteriores, rutas, techos, energía y continuidad.'},
      wildfire:{headline:'SEÑAL DE INCENDIO / FUEGO',meaning:'La fuente reporta incendio o actividad de fuego. Debe distinguirse entre incendio confirmado y anomalía térmica satelital según el proveedor.',notMeans:'La señal no demuestra automáticamente exposición de trabajadores ni afectación de instalaciones.',sst:'Verificar humo, viento, calidad del aire, combustibles, trabajadores exteriores, accesos y rutas.'},
      landslide:{headline:'SEÑAL DE DESLIZAMIENTO',meaning:'Se reporta movimiento de tierra o inestabilidad de ladera en una zona determinada.',notMeans:'No confirma inestabilidad en todos los taludes o vías cercanas.',sst:'Restringir exposición cerca de laderas comprometidas y verificar rutas, drenaje y estabilidad local.'},
      volcano:{headline:'SEÑAL VOLCÁNICA',meaning:'La fuente reporta actividad volcánica o emisión asociada.',notMeans:'No equivale a concentración de ceniza o exposición ocupacional en una ubicación concreta.',sst:'Verificar ceniza, aire, visibilidad, rutas, ventilación y boletines técnicos.'},
      outage:{headline:'SEÑAL DE INTERRUPCIÓN',meaning:'La fuente identifica una degradación o interrupción de conectividad/servicio.',notMeans:'No significa necesariamente pérdida total del servicio en cada sede.',sst:'Comprobar comunicaciones críticas, alarmas, canales alternos y continuidad.'},
      radiation:{headline:'SEÑAL RADIOLÓGICA',meaning:'La fuente reporta una observación de radiación ionizante.',notMeans:'No equivale por sí sola a dosis ocupacional ni confirma exposición de trabajadores.',sst:'Contrastar ubicación, unidad, fondo local, autoridad competente y medición ocupacional cuando aplique.'},
      air:{headline:'SEÑAL DE CALIDAD AMBIENTAL',meaning:'La fuente reporta condiciones de calidad del aire o exposición ambiental.',notMeans:'No sustituye mediciones de higiene ocupacional en el puesto de trabajo.',sst:'Relacionar el dato con tarea, duración, trabajadores sensibles, ventilación y medición local.'},
      natural:{headline:'SEÑAL DE EVENTO NATURAL',meaning:'La fuente reporta un evento natural que requiere identificar con precisión fenómeno, ubicación, extensión y evolución antes de tomar decisiones.',notMeans:'La presencia de una señal en el monitor no confirma daño ni exposición.',sst:'Contrastar fuente, ubicación y evolución y cruzar con trabajadores, sedes, rutas y servicios reales.'}
    };
    return map[kind]||map.natural;
  }

  function interpretation(x){
    const kind=typeof eventKind==='function'?eventKind(x):'natural';
    if(isGdacs(x)){
      const l=gdacsLevel(x);
      let d=null;
      if(kind==='flood')d=gdacsFlood(l);
      else if(kind==='earthquake')d=gdacsEq(l);
      else if(kind==='storm')d=gdacsStorm(l);
      else if(kind==='wildfire')d=gdacsWildfire(l);
      else if(kind==='volcano')d=gdacsVolcano(l);
      else if(/tsunami/i.test(hay(x)))d=gdacsTsunami(l);
      if(!d)d={headline:`ALERTA GDACS · NIVEL ${levelEs(l).toUpperCase()}`,meaning:'GDACS es un sistema global ONU/Comisión Europea de alerta y coordinación. Su color expresa prioridad/impacto humanitario internacional según el tipo de evento.',notMeans:'El color GDACS no es un nivel de riesgo laboral de tu empresa ni confirma daño local.',reference:'Verde, Naranja y Rojo tienen criterios distintos según terremoto, inundación, ciclón, tsunami, incendio o volcán.',sst:'Usar la alerta como disparador de verificación y cruzarla con la exposición real de trabajadores, sedes, rutas y servicios.'};
      return {...d,level:l,gdacs:true,kind};
    }
    return {...genericMeaning(x,kind),level:null,gdacs:false,kind};
  }

  function installCss(){
    if(document.querySelector('#hazard-explainer-css'))return;
    const s=document.createElement('style');s.id='hazard-explainer-css';s.textContent=`
      .signal-explain{margin:8px 0;border:1px solid #d8e4e9;border-radius:12px;background:#fbfdfe;padding:10px;display:grid;gap:7px}.signal-explain-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.signal-explain-head b{font-size:10px;color:#00205b}.gdacs-level{font-size:8px;font-weight:900;border-radius:999px;padding:4px 7px}.gdacs-level.green{background:#eef8ec;color:#477c31;border:1px solid #cfe4c8}.gdacs-level.orange{background:#fff6e7;color:#925d00;border:1px solid #efd8aa}.gdacs-level.red{background:#fff0ee;color:#a7352b;border:1px solid #efc9c4}.signal-explain p{margin:0!important;font-size:9.5px!important;line-height:1.45!important;color:#475569!important;background:none!important;padding:0!important}.signal-explain .does-not{border-left:3px solid #ffb600;padding-left:7px}.signal-explain .reference{font-size:8.5px!important;color:#64748b!important}.signal-explain .sst-meaning{border-left:3px solid #007b85;padding:7px;background:#f2fafa;border-radius:0 8px 8px 0}.signal-explain .sst-meaning b{display:block;color:#007b85;font-size:9px;text-transform:uppercase;margin-bottom:2px}
      .signal-card-explain{margin:7px 0 0;padding:8px 9px;background:#f7fafc;border:1px solid #e2e8f0;border-radius:10px}.signal-card-explain b{display:block;color:#00205b;font-size:9px;margin-bottom:2px}.signal-card-explain p{font-size:9px;line-height:1.35;color:#475569;margin:0}.signal-title-es{font-weight:800}.impact-level.high,.impact-level.medium,.impact-level.low{text-transform:none}
    `;document.head.appendChild(s);
  }

  function explainerHtml(x,compact=false){
    const d=interpretation(x);
    if(compact)return `<div class="signal-card-explain"><b>¿Qué significa esta señal?</b><p>${safe(d.meaning)}</p></div>`;
    return `<section class="signal-explain">
      <div class="signal-explain-head"><b>${safe(d.headline)}</b>${d.gdacs?`<span class="gdacs-level ${levelClass(d.level)}">GDACS ${safe(levelEs(d.level))}</span>`:''}</div>
      <p>${safe(d.meaning)}</p>
      <p class="does-not"><b>Esto NO significa:</b> ${safe(d.notMeans)}</p>
      ${d.reference?`<p class="reference"><b>Cómo se interpreta:</b> ${safe(d.reference)}</p>`:''}
      <div class="sst-meaning"><b>Qué significa para SST</b><p>${safe(d.sst)}</p></div>
    </section>`;
  }

  impactLabel=function(level){return level==='high'?'Prioridad preventiva alta':level==='medium'?'Prioridad preventiva media':'Prioridad preventiva baja'};

  function enhanceCards(items){
    for(const x of items){
      const card=document.querySelector(`.event-card[data-id="${CSS.escape(String(x.id))}"]`);if(!card)continue;
      const h=card.querySelector('h4');if(h)h.textContent=displayTitle(x);
      if(!card.querySelector('.signal-card-explain')){
        const desc=card.querySelector('.event-desc')||card.querySelector('.impact-mini');
        if(desc)desc.insertAdjacentHTML('afterend',explainerHtml(x,true));
      }
      const mini=card.querySelector('.impact-mini b');if(mini)mini.textContent=impactLabel(impactModel(x).level);
    }
  }

  function enhancePopup(popup){
    const src=popup?._source;const entry=Array.isArray(markers)?markers.find(m=>m.marker===src):null;
    const x=entry?rawItems.find(i=>i.id===entry.id):null;if(!x)return;
    const root=popup.getElement()?.querySelector('.popup-card,.sst-popup');if(!root)return;
    const title=root.querySelector('.popup-title,strong');if(title)title.textContent=displayTitle(x);
    if(root.querySelector('.signal-explain'))return;
    const anchor=root.querySelector('.popup-check,.popup-source,.territorial-box');
    const tmp=document.createElement('div');tmp.innerHTML=explainerHtml(x,false);const block=tmp.firstElementChild;
    if(anchor)root.insertBefore(block,anchor);else root.appendChild(block);
    const impact=root.querySelector('.popup-impact b');if(impact)impact.textContent=impactLabel(impactModel(x).level);
  }

  renderImpactDetail=function(x){
    baseImpactDetail(x);if(!x)return;
    const root=document.querySelector('#impactDetail');if(!root)return;
    const h=root.querySelector('.impact-detail-head h4');if(h)h.textContent=displayTitle(x);
    const badge=root.querySelector('.impact-level');if(badge)badge.textContent=impactLabel(impactModel(x).level);
    if(!root.querySelector('.signal-explain')){
      const explain=root.querySelector('.impact-explain');
      if(explain)explain.insertAdjacentHTML('afterend',explainerHtml(x,false));else root.insertAdjacentHTML('afterbegin',explainerHtml(x,false));
    }
  };

  render=function(){baseRender();try{enhanceCards(filtered())}catch(e){console.warn('Signal explainer cards',e)}};

  installCss();
  if(typeof map!=='undefined'&&map?.on)map.on('popupopen',e=>setTimeout(()=>enhancePopup(e.popup),30));
  try{render()}catch(e){console.warn('Signal explainer init',e)}
})();
