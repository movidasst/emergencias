const API='https://lfdmbkzghnwvsapxypvt.supabase.co/functions/v1/world-monitor-sst';

const feedMeta={
  natural:{title:'Eventos naturales',action:'Revisar exposición de sedes, rutas y trabajadores; validar comunicaciones, evacuación y continuidad.'},
  outages:{title:'Infraestructura y conectividad',action:'Verificar comunicaciones críticas, teletrabajo, alarmas, coordinación de brigadas y canales alternos.'},
  radiation:{title:'Radiación',action:'Contrastar con la autoridad competente y evaluar exposición solo con datos confirmados y criterios técnicos.'},
  air:{title:'Calidad ambiental',action:'Revisar exposición de personal al aire libre, grupos sensibles, ventilación y necesidad de medidas temporales.'}
};

const scopeMeta={
  ve:{label:'Venezuela + entorno',panel:'Venezuela',center:[7.2,-66.2],zoom:5},
  latam:{label:'Latinoamérica',panel:'LatAm',center:[-8,-64],zoom:3},
  world:{label:'Mundo',panel:'Mundo',center:[18,0],zoom:2}
};

const impactDomains={
  workers:{label:'Trabajadores',icon:'👷'},
  facilities:{label:'Instalaciones',icon:'🏭'},
  mobility:{label:'Movilidad',icon:'🚚'},
  services:{label:'Servicios',icon:'⚡'},
  communications:{label:'Comunicaciones',icon:'📡'},
  continuity:{label:'Continuidad',icon:'🔄'}
};

const VENEZUELA_REFERENCE_POINTS=[
  ['Maracaibo',10.6427,-71.6125],['San Cristóbal',7.7669,-72.2250],['Mérida',8.5897,-71.1561],
  ['Barquisimeto',10.0678,-69.3474],['Caracas',10.4806,-66.9036],['Valencia',10.1620,-68.0077],
  ['Puerto La Cruz',10.2138,-64.6328],['Cumaná',10.4564,-64.1670],['Maturín',9.7457,-63.1832],
  ['Ciudad Guayana',8.2917,-62.7346],['Puerto Ayacucho',5.6639,-67.6236],['Santa Elena de Uairén',4.6023,-61.1100],
  ['Porlamar',10.9577,-63.8697],['Coro',11.4045,-69.6734]
];

let activeFeed='natural';
let activeScope='ve';
let rawItems=[];
let markers=[];
let providerMode='';
let selectedImpactId='';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];

const map=L.map('map',{zoomControl:false,worldCopyJump:true,minZoom:2}).setView(scopeMeta.ve.center,scopeMeta.ve.zoom);
L.control.zoom({position:'bottomright'}).addTo(map);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  maxZoom:18,
  attribution:'© OpenStreetMap contributors'
}).addTo(map);
const markerLayer=L.layerGroup().addTo(map);

const VE_BOUNDS={south:-0.8,north:13.8,west:-74.8,east:-57.8};
const LATAM_BOUNDS={south:-56.8,north:33.2,west:-119.5,east:-33.0};
const VE_WORDS=/venezuela|caracas|maracaibo|valencia|barquisimeto|maracay|matur[ií]n|barcelona|puerto la cruz|ciudad guayana|san crist[oó]bal|m[eé]rida|coro|cuman[aá]|guanare|barinas|trujillo|tachira|t[aá]chira|zulia|miranda|aragua|carabobo|lara|anzo[aá]tegui|monagas|bol[ií]var|apure|amazonas|delta amacuro|nueva esparta|sucre|falc[oó]n|portuguesa|yaracuy|cojedes|vargas|la guaira/i;

function toast(msg){
  const el=$('#toast');
  el.textContent=msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t=setTimeout(()=>el.classList.remove('show'),3200);
}
function text(v){return String(v??'').trim()}
function first(...vals){return vals.find(v=>v!==undefined&&v!==null&&String(v).trim()!=='')}
function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function cleanUrl(v){try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return''}}
function esc(s){return text(s).replace(/[&<>'\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[m]))}

function pickArray(payload){
  if(Array.isArray(payload))return payload;
  for(const k of ['events','observations','outages','services','items','results','data','features']){
    if(Array.isArray(payload?.[k]))return payload[k];
  }
  for(const v of Object.values(payload||{})){
    if(Array.isArray(v))return v;
  }
  return[];
}

function severityOf(o){
  const s=text(first(o.alertLevel,o.alert_level,o.severity,o.level,o.status,o.riskLevel,o.risk_level)).toLowerCase();
  if(/red|critical|major|severe|extreme|high|danger|outage/.test(s))return'critical';
  if(/orange|yellow|warning|watch|moderate|degraded|elevated/.test(s))return'warning';
  return'advisory';
}

function coordsOf(o){
  const loc=o.location||o.coordinates||o.geometry||{};
  let lat=first(loc.latitude,loc.lat,o.latitude,o.lat);
  let lon=first(loc.longitude,loc.lon,loc.lng,o.longitude,o.lon,o.lng);
  if(Array.isArray(loc.coordinates)){
    lon=first(lon,loc.coordinates[0]);
    lat=first(lat,loc.coordinates[1]);
  }
  return{lat:n(lat),lon:n(lon)};
}

function timeOf(o){
  const v=first(o.occurredAt,o.updatedAt,o.startedAt,o.date,o.time,o.timestamp,o.createdAt,o.updated_at);
  if(!v)return'';
  const d=new Date(typeof v==='number'&&v<1e12?v*1000:v);
  return Number.isNaN(d.getTime())?'':d.toLocaleString('es-VE',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Caracas'});
}

function normalize(o,i){
  const c=coordsOf(o);
  const title=text(first(o.title,o.name,o.eventType,o.event_type,o.type,o.label,o.service,o.station,'Señal sin título'));
  const country=text(first(o.country,o.countryName,o.country_name,o.admin1,o.region,o.location?.country,o.location?.name));
  const desc=text(first(o.description,o.summary,o.details,o.message,o.statusMessage,o.status_message,o.sourceDescription));
  const source=text(first(o.source,o.provider,o.sources?.[0],o.network,'Fuente de datos'));
  const url=cleanUrl(first(o.url,o.link,o.sourceUrl,o.source_url));
  return{
    id:text(first(o.id,o.eventId,o.event_id,`${activeFeed}-${i}`)),
    title,country,desc,source,url,lat:c.lat,lon:c.lon,
    severity:severityOf(o),time:timeOf(o),raw:o
  };
}

function inBounds(x,b){
  return x.lat!==null&&x.lon!==null&&x.lat>=b.south&&x.lat<=b.north&&x.lon>=b.west&&x.lon<=b.east;
}
function isVenezuelaFocus(x){
  const haystack=[x.title,x.country,x.desc].join(' ');
  return VE_WORDS.test(haystack)||inBounds(x,VE_BOUNDS);
}
function inScope(x){
  if(activeScope==='world')return true;
  if(activeScope==='latam')return inBounds(x,LATAM_BOUNDS)||/américa latina|latin america|caribbean|caribe/i.test([x.country,x.desc].join(' '));
  return isVenezuelaFocus(x);
}

function toRad(v){return v*Math.PI/180}
function haversine(lat1,lon1,lat2,lon2){
  const R=6371;
  const dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
function distanceToVenezuela(x){
  if(isVenezuelaFocus(x))return 0;
  if(x.lat===null||x.lon===null)return null;
  return Math.min(...VENEZUELA_REFERENCE_POINTS.map(([,lat,lon])=>haversine(x.lat,x.lon,lat,lon)));
}

function eventKind(x){
  const s=[x.title,x.desc].join(' ').toLowerCase();
  if(/earthquake|sismo|terremoto|seismic/.test(s))return'earthquake';
  if(/flood|inundaci|crecida|desbord/.test(s))return'flood';
  if(/hurricane|hurac[aá]n|cyclone|cicl[oó]n|tropical storm|tormenta|tif[oó]n/.test(s))return'storm';
  if(/wildfire|forest fire|incendio forestal|fire/.test(s))return'wildfire';
  if(/volcano|volc[aá]n|eruption|erupci/.test(s))return'volcano';
  if(/landslide|deslizamiento|alud|mudslide/.test(s))return'landslide';
  if(activeFeed==='outages'||/outage|internet|connectivity|conectividad|network|red /.test(s))return'outage';
  if(activeFeed==='radiation'||/radiation|radiaci|cpm|µsv|usv/.test(s))return'radiation';
  if(activeFeed==='air'||/air quality|calidad del aire|aqi|pm2\.5|pm10/.test(s))return'air';
  return activeFeed==='natural'?'natural':'other';
}

function impactActions(kind,level){
  const urgent=level==='high';
  const common=urgent
    ? ['Verificar de inmediato si hay trabajadores, sedes o rutas expuestas.','Contrastar la señal con la autoridad competente antes de emitir instrucciones.']
    : ['Confirmar ubicación, hora y evolución antes de escalar la respuesta.','Revisar si existen trabajadores, sedes, rutas o servicios expuestos.'];
  const specific={
    earthquake:['Inspeccionar condiciones visibles antes de reocupar áreas afectadas.','Confirmar comunicaciones, puntos de reunión y rutas de evacuación.'],
    flood:['Revisar accesos, drenajes, rutas de traslado y trabajos en zonas bajas.','Evitar desplazamientos hacia áreas anegadas hasta verificar condiciones seguras.'],
    storm:['Revisar trabajos a la intemperie, techos, objetos sueltos y energía de respaldo.','Asegurar comunicación con personal móvil y criterios para suspender tareas expuestas.'],
    wildfire:['Evaluar humo, visibilidad y exposición respiratoria de personal al aire libre.','Revisar rutas alternativas y posible afectación de energía o comunicaciones.'],
    volcano:['Vigilar ceniza, calidad del aire y afectación de rutas o vuelos.','Evitar decisiones por rumores y confirmar boletines técnicos oficiales.'],
    landslide:['Restringir tránsito y labores cerca de taludes o laderas comprometidas.','Verificar rutas alternas, drenaje y estabilidad observable del terreno.'],
    outage:['Activar canales alternos de comunicación y verificar sistemas críticos.','Revisar teletrabajo, alarmas, coordinación de brigadas y continuidad operativa.'],
    radiation:['No inferir exposición ocupacional sin medición y confirmación técnica.','Contrastar con autoridades sanitarias/radiológicas y revisar ubicación de la observación.'],
    air:['Revisar exposición de personal al aire libre y grupos sensibles.','Ajustar temporalmente tareas, ventilación o permanencia exterior según condiciones verificadas.'],
    natural:['Revisar el plan de emergencia aplicable al tipo de evento.','Confirmar continuidad de servicios, accesos y comunicación con el personal.'],
    other:['Revisar controles existentes y criterios internos de escalamiento.','Documentar fuente, hora y decisión adoptada.']
  };
  return [...common,...(specific[kind]||specific.other)].slice(0,4);
}

function impactDomainsFor(kind){
  const mapByKind={
    earthquake:['workers','facilities','mobility','services','communications','continuity'],
    flood:['workers','facilities','mobility','services','continuity'],
    storm:['workers','facilities','mobility','services','communications','continuity'],
    wildfire:['workers','mobility','services','continuity'],
    volcano:['workers','mobility','services','continuity'],
    landslide:['workers','facilities','mobility','continuity'],
    outage:['workers','services','communications','continuity'],
    radiation:['workers','facilities','continuity'],
    air:['workers','continuity'],
    natural:['workers','facilities','mobility','continuity'],
    other:['workers','continuity']
  };
  return mapByKind[kind]||mapByKind.other;
}

function impactModel(x){
  const inside=isVenezuelaFocus(x);
  const distance=distanceToVenezuela(x);
  const kind=eventKind(x);
  let score=x.severity==='critical'?4:x.severity==='warning'?2:1;
  if(inside)score+=4;
  else if(distance!==null&&distance<=250)score+=3;
  else if(distance!==null&&distance<=600)score+=2;
  else if(distance!==null&&distance<=1200)score+=1;
  if(['earthquake','storm','flood','outage'].includes(kind)&&inside)score+=1;
  const level=score>=7?'high':score>=4?'medium':'low';
  const confidence=(x.lat!==null&&x.lon!==null)||VE_WORDS.test([x.title,x.country,x.desc].join(' '))?'alta':'media';
  const proximity=inside?'Dentro de Venezuela / entorno inmediato':distance===null?'Proximidad no determinada':`≈ ${Math.round(distance)} km del punto venezolano de referencia más cercano`;
  const domains=impactDomainsFor(kind);
  const summary={
    high:'La señal merece verificación prioritaria porque combina severidad y relevancia territorial para Venezuela.',
    medium:'La señal puede requerir preparación o seguimiento si coincide con trabajadores, sedes, rutas o servicios expuestos.',
    low:'La señal se mantiene como contexto preventivo; no implica afectación directa a Venezuela por sí sola.'
  }[level];
  return{score,level,kind,confidence,proximity,domains,summary,actions:impactActions(kind,level)};
}

function impactLabel(level){return level==='high'?'Impacto potencial alto':level==='medium'?'Impacto potencial medio':'Impacto potencial bajo'}
function impactRank(level){return level==='high'?3:level==='medium'?2:1}

function filtered(){
  const q=$('#searchInput').value.trim().toLowerCase();
  const sev=$('#severityFilter').value;
  return rawItems
    .filter(x=>inScope(x)&&(sev==='all'||x.severity===sev)&&(!q||[x.title,x.country,x.desc,x.source].join(' ').toLowerCase().includes(q)))
    .sort((a,b)=>impactRank(impactModel(b).level)-impactRank(impactModel(a).level));
}

function severityLabel(s){
  return s==='critical'?'Prioridad alta':s==='warning'?'Atención':'Informativa';
}
function markerColor(s){
  return s==='critical'?'#c0392b':s==='warning'?'#d97706':'#3f8f3a';
}
function sstReading(x){
  const base=feedMeta[activeFeed].action;
  if(x.severity==='critical')return `Prioridad alta: ${base}`;
  if(x.severity==='warning')return `Atención: ${base}`;
  return `Vigilancia: ${base}`;
}
function proximityLabel(x){
  return isVenezuelaFocus(x)?'Venezuela / entorno':'Contexto regional';
}

function renderImpactDetail(x){
  const box=$('#impactDetail');
  if(!box)return;
  if(!x){
    box.innerHTML='<div class="impact-empty"><strong>Selecciona una señal</strong><p>Toca una tarjeta del listado para ver su lectura de impacto potencial sobre Venezuela.</p></div>';
    return;
  }
  const m=impactModel(x);
  box.innerHTML=`
    <div class="impact-detail-head">
      <div>
        <span class="impact-level ${m.level}">${impactLabel(m.level)}</span>
        <h4>${esc(x.title)}</h4>
        <p>${esc([x.country,x.time,x.source].filter(Boolean).join(' · '))}</p>
      </div>
      <div class="impact-score" aria-label="Índice preventivo ${m.score} de 9"><b>${m.score}</b><span>/9</span></div>
    </div>
    <div class="impact-explain">
      <p>${esc(m.summary)}</p>
      <span><b>Proximidad:</b> ${esc(m.proximity)}</span>
      <span><b>Confianza de lectura:</b> ${esc(m.confidence)}</span>
    </div>
    <div class="impact-domain-chips">${m.domains.map(k=>`<span>${impactDomains[k].icon} ${impactDomains[k].label}</span>`).join('')}</div>
    <div class="impact-actions">
      <b>Qué revisar ahora</b>
      <ul>${m.actions.map(a=>`<li>${esc(a)}</li>`).join('')}</ul>
    </div>
    ${x.url?`<a class="impact-source" href="${esc(x.url)}" target="_blank" rel="noopener">Ver fuente original ↗</a>`:''}
  `;
}

function renderImpactDashboard(items){
  const high=items.filter(x=>impactModel(x).level==='high').length;
  const medium=items.filter(x=>impactModel(x).level==='medium').length;
  const low=items.filter(x=>impactModel(x).level==='low').length;
  $('#impactHigh').textContent=high;
  $('#impactMedium').textContent=medium;
  $('#impactLow').textContent=low;
  const counts=Object.fromEntries(Object.keys(impactDomains).map(k=>[k,0]));
  items.forEach(x=>impactModel(x).domains.forEach(k=>counts[k]++));
  $('#impactDomains').innerHTML=Object.entries(impactDomains).map(([k,d])=>`
    <article><span>${d.icon}</span><div><b>${counts[k]}</b><small>${d.label}</small></div></article>
  `).join('');
  if(!items.length){
    selectedImpactId='';
    renderImpactDetail(null);
    return;
  }
  let selected=items.find(x=>x.id===selectedImpactId);
  if(!selected){selected=items[0];selectedImpactId=selected.id;}
  renderImpactDetail(selected);
}

function render(){
  const items=filtered();
  $('#resultCount').textContent=items.length;
  $('#statTotal').textContent=items.length;
  $('#statCritical').textContent=items.filter(x=>x.severity==='critical').length;
  $('#statSources').textContent=new Set(items.map(x=>x.source).filter(Boolean)).size||'—';
  $('#statScope').textContent=scopeMeta[activeScope].label;
  $('#mapScopeTitle').textContent=scopeMeta[activeScope].label;
  $('#panelTitle').textContent=`${feedMeta[activeFeed].title} · ${scopeMeta[activeScope].panel}`;
  renderImpactDashboard(items);

  const list=$('#feedList');
  markerLayer.clearLayers();
  markers=[];

  if(!items.length){
    list.innerHTML=`<div class="empty"><span>◎</span><strong>Sin señales en este foco.</strong><p>No hay resultados que coincidan con la cobertura y filtros actuales. Puedes ampliar a LatAm o Mundo.</p></div>`;
    return;
  }

  list.innerHTML=items.map(x=>{
    const impact=impactModel(x);
    return `
    <article class="event-card ${selectedImpactId===x.id?'selected':''}" data-id="${esc(x.id)}">
      <div class="event-top">
        <div class="event-title-wrap">
          <span class="geo-badge">${esc(proximityLabel(x))}</span>
          <h4>${esc(x.title)}</h4>
        </div>
        <span class="severity ${x.severity}">${severityLabel(x.severity)}</span>
      </div>
      <p class="event-meta">${esc([x.country,x.time,x.source].filter(Boolean).join(' · '))}</p>
      ${x.desc?`<p class="event-desc">${esc(x.desc.slice(0,170))}${x.desc.length>170?'…':''}</p>`:''}
      <div class="impact-mini ${impact.level}">
        <b>${impactLabel(impact.level)}</b>
        <span>${impact.domains.slice(0,3).map(k=>impactDomains[k].label).join(' · ')}</span>
      </div>
      <div class="sst-note"><b>Lectura SST</b><span>${esc(sstReading(x))}</span></div>
      <button class="impact-open" type="button">Ver impacto Venezuela →</button>
    </article>`;
  }).join('');

  items.forEach(x=>{
    if(x.lat===null||x.lon===null)return;
    const impact=impactModel(x);
    const marker=L.circleMarker([x.lat,x.lon],{
      radius:x.severity==='critical'?9:8,
      color:'#fff',
      weight:2,
      fillColor:markerColor(x.severity),
      fillOpacity:.94
    });
    marker.bindPopup(`
      <div class="popup-card">
        <span class="popup-priority">${esc(severityLabel(x.severity))}</span>
        <strong>${esc(x.title)}</strong>
        <small>${esc([x.country,x.source,x.time].filter(Boolean).join(' · '))}</small>
        <p><b>${esc(impactLabel(impact.level))}</b><br>${esc(impact.summary)}</p>
        ${x.url?`<a href="${esc(x.url)}" target="_blank" rel="noopener">Abrir fuente ↗</a>`:''}
      </div>
    `);
    marker.addTo(markerLayer);
    markers.push({id:x.id,marker});
  });

  $$('.event-card').forEach(el=>el.addEventListener('click',()=>{
    const x=items.find(i=>i.id===el.dataset.id);
    if(!x)return;
    selectedImpactId=x.id;
    renderImpactDetail(x);
    $$('.event-card').forEach(card=>card.classList.toggle('selected',card.dataset.id===x.id));
    const m=markers.find(m=>m.id===x.id);
    if(m){
      map.setView(m.marker.getLatLng(),Math.max(map.getZoom(),6),{animate:true});
      m.marker.openPopup();
    }
    $('#impactDashboard')?.scrollIntoView({behavior:'smooth',block:'start'});
  }));
}

function recenter(){
  const meta=scopeMeta[activeScope];
  map.setView(meta.center,meta.zoom,{animate:true});
}

function updateProvider(payload){
  providerMode=payload?.provider_mode||'';
  const el=$('#providerMode');
  if(providerMode==='world-monitor'){
    el.textContent='World Monitor · enriquecido';
  }else if(providerMode==='public-fallback'){
    el.textContent='Fuentes públicas verificables';
  }else{
    el.textContent='Fuentes de inteligencia situacional';
  }
}

async function loadFeed(feed=activeFeed){
  activeFeed=feed;
  selectedImpactId='';
  $('#panelTitle').textContent=`${feedMeta[feed].title} · ${scopeMeta[activeScope].panel}`;
  $('#feedList').innerHTML='<div class="empty loading"><span></span><strong>Consultando señales…</strong></div>';
  $('#livePill').classList.remove('online');
  $('#livePill b').textContent='Actualizando';

  try{
    const r=await fetch(`${API}?feed=${encodeURIComponent(feed)}`,{headers:{Accept:'application/json'}});
    const payload=await r.json().catch(()=>({}));
    if(!r.ok){
      const err=new Error(payload?.error||`HTTP ${r.status}`);
      err.code=payload?.error;
      throw err;
    }
    updateProvider(payload);
    rawItems=pickArray(payload.data??payload).map(normalize);
    $('#statTime').textContent=new Date().toLocaleTimeString('es-VE',{hour:'2-digit',minute:'2-digit',timeZone:'America/Caracas'});
    $('#livePill').classList.add('online');
    $('#livePill b').textContent='En vivo';
    render();
    recenter();
    const visible=filtered().length;
    if(!visible&&activeScope==='ve')toast('Sin señales en Venezuela/entorno para esta capa · puedes ampliar a LatAm');
  }catch(e){
    rawItems=[];
    markerLayer.clearLayers();
    ['#statTotal','#statCritical','#statSources','#statTime'].forEach(id=>$(id).textContent='—');
    $('#resultCount').textContent='0';
    $('#feedList').innerHTML='<div class="empty error"><span>!</span><strong>No se pudo consultar la fuente.</strong><p>Intenta actualizar nuevamente. Las demás herramientas de Emergencias siguen disponibles.</p></div>';
    $('#livePill').classList.remove('online');
    $('#livePill b').textContent='Sin conexión';
    $('#providerMode').textContent='Fuente temporalmente no disponible';
    renderImpactDashboard([]);
    toast('No se pudo actualizar esta capa');
    console.error(e);
  }
}

$$('.feed-tab').forEach(btn=>btn.addEventListener('click',()=>{
  $$('.feed-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  loadFeed(btn.dataset.feed);
}));

$$('.scope-btn').forEach(btn=>btn.addEventListener('click',()=>{
  activeScope=btn.dataset.scope;
  selectedImpactId='';
  $$('.scope-btn').forEach(b=>b.classList.toggle('active',b===btn));
  render();
  recenter();
}));

$('#searchInput').addEventListener('input',()=>{selectedImpactId='';render();});
$('#severityFilter').addEventListener('change',()=>{selectedImpactId='';render();});
$('#refreshBtn').addEventListener('click',()=>loadFeed());
$('#recenterBtn').addEventListener('click',recenter);

loadFeed();
