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

let activeFeed='natural';
let activeScope='ve';
let rawItems=[];
let markers=[];
let providerMode='';

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
function esc(s){return text(s).replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]))}

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

function filtered(){
  const q=$('#searchInput').value.trim().toLowerCase();
  const sev=$('#severityFilter').value;
  return rawItems.filter(x=>
    inScope(x)&&
    (sev==='all'||x.severity===sev)&&
    (!q||[x.title,x.country,x.desc,x.source].join(' ').toLowerCase().includes(q))
  );
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

function render(){
  const items=filtered();
  $('#resultCount').textContent=items.length;
  $('#statTotal').textContent=items.length;
  $('#statCritical').textContent=items.filter(x=>x.severity==='critical').length;
  $('#statSources').textContent=new Set(items.map(x=>x.source).filter(Boolean)).size||'—';
  $('#statScope').textContent=scopeMeta[activeScope].label;
  $('#mapScopeTitle').textContent=scopeMeta[activeScope].label;
  $('#panelTitle').textContent=`${feedMeta[activeFeed].title} · ${scopeMeta[activeScope].panel}`;

  const list=$('#feedList');
  markerLayer.clearLayers();
  markers=[];

  if(!items.length){
    list.innerHTML=`<div class="empty"><span>◎</span><strong>Sin señales en este foco.</strong><p>No hay resultados que coincidan con la cobertura y filtros actuales. Puedes ampliar a LatAm o Mundo.</p></div>`;
    return;
  }

  list.innerHTML=items.map(x=>`
    <article class="event-card" data-id="${esc(x.id)}">
      <div class="event-top">
        <div class="event-title-wrap">
          <span class="geo-badge">${esc(proximityLabel(x))}</span>
          <h4>${esc(x.title)}</h4>
        </div>
        <span class="severity ${x.severity}">${severityLabel(x.severity)}</span>
      </div>
      <p class="event-meta">${esc([x.country,x.time,x.source].filter(Boolean).join(' · '))}</p>
      ${x.desc?`<p class="event-desc">${esc(x.desc.slice(0,170))}${x.desc.length>170?'…':''}</p>`:''}
      <div class="sst-note"><b>Lectura SST</b><span>${esc(sstReading(x))}</span></div>
    </article>
  `).join('');

  items.forEach(x=>{
    if(x.lat===null||x.lon===null)return;
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
        <p>${esc(sstReading(x))}</p>
        ${x.url?`<a href="${esc(x.url)}" target="_blank" rel="noopener">Abrir fuente ↗</a>`:''}
      </div>
    `);
    marker.addTo(markerLayer);
    markers.push({id:x.id,marker});
  });

  $$('.event-card').forEach(el=>el.addEventListener('click',()=>{
    const x=items.find(i=>i.id===el.dataset.id);
    if(!x)return;
    const m=markers.find(m=>m.id===x.id);
    if(m){
      map.setView(m.marker.getLatLng(),Math.max(map.getZoom(),6),{animate:true});
      m.marker.openPopup();
    }else if(x.url){
      window.open(x.url,'_blank','noopener');
    }
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
  $$('.scope-btn').forEach(b=>b.classList.toggle('active',b===btn));
  render();
  recenter();
}));

$('#searchInput').addEventListener('input',render);
$('#severityFilter').addEventListener('change',render);
$('#refreshBtn').addEventListener('click',()=>loadFeed());
$('#recenterBtn').addEventListener('click',recenter);

loadFeed();
