const API='https://lfdmbkzghnwvsapxypvt.supabase.co/functions/v1/world-monitor-sst';

const feedMeta={
  natural:{title:'Eventos naturales',action:'Revisar exposición de sedes, rutas y trabajadores; validar comunicaciones, evacuación y continuidad.'},
  outages:{title:'Infraestructura y conectividad',action:'Verificar comunicaciones críticas, teletrabajo, alarmas, coordinación de brigadas y canales alternos.'},
  radiation:{title:'Radiación',action:'Contrastar con la autoridad competente y evaluar exposición solo con datos confirmados y criterios técnicos.'},
  air:{title:'Calidad ambiental',action:'Revisar exposición de personal al aire libre, grupos sensibles, ventilación y necesidad de medidas temporales.'}
};

const FALLBACK_COUNTRIES=[
  {code:'VE',name:'Venezuela',english:'Venezuela',lat:6.42,lon:-66.59,zoom:5,bbox:'-73.4,0.6,-59.8,12.3'},
  {code:'AR',name:'Argentina',english:'Argentina',lat:-38.42,lon:-63.62,zoom:4,bbox:'-73.6,-55.1,-53.6,-21.8'},
  {code:'BO',name:'Bolivia',english:'Bolivia',lat:-16.29,lon:-63.59,zoom:5,bbox:'-69.7,-22.9,-57.5,-9.7'},
  {code:'BR',name:'Brasil',english:'Brazil',lat:-14.24,lon:-51.93,zoom:4,bbox:'-74.0,-33.8,-34.8,5.3'},
  {code:'CL',name:'Chile',english:'Chile',lat:-33.45,lon:-70.67,zoom:4,bbox:'-75.7,-56.0,-66.4,-17.4'},
  {code:'CO',name:'Colombia',english:'Colombia',lat:4.57,lon:-74.30,zoom:5,bbox:'-79.1,-4.3,-66.8,13.5'},
  {code:'CR',name:'Costa Rica',english:'Costa Rica',lat:9.75,lon:-83.75,zoom:7,bbox:'-86.0,8.0,-82.5,11.2'},
  {code:'CU',name:'Cuba',english:'Cuba',lat:21.52,lon:-77.78,zoom:6,bbox:'-85.0,19.8,-74.1,23.3'},
  {code:'DO',name:'República Dominicana',english:'Dominican Republic',lat:18.74,lon:-70.16,zoom:7,bbox:'-72.0,17.5,-68.3,19.9'},
  {code:'EC',name:'Ecuador',english:'Ecuador',lat:-1.83,lon:-78.18,zoom:6,bbox:'-81.1,-5.1,-75.2,1.5'},
  {code:'SV',name:'El Salvador',english:'El Salvador',lat:13.79,lon:-88.90,zoom:8,bbox:'-90.2,13.1,-87.7,14.5'},
  {code:'GT',name:'Guatemala',english:'Guatemala',lat:15.78,lon:-90.23,zoom:7,bbox:'-92.3,13.7,-88.2,17.8'},
  {code:'GY',name:'Guyana',english:'Guyana',lat:4.86,lon:-58.93,zoom:6,bbox:'-61.4,1.2,-56.5,8.6'},
  {code:'HT',name:'Haití',english:'Haiti',lat:18.97,lon:-72.29,zoom:7,bbox:'-74.5,18.0,-71.6,20.1'},
  {code:'HN',name:'Honduras',english:'Honduras',lat:15.20,lon:-86.24,zoom:7,bbox:'-89.4,12.9,-83.1,16.5'},
  {code:'JM',name:'Jamaica',english:'Jamaica',lat:18.11,lon:-77.30,zoom:8,bbox:'-78.4,17.7,-76.2,18.6'},
  {code:'MX',name:'México',english:'Mexico',lat:23.63,lon:-102.55,zoom:4,bbox:'-118.4,14.5,-86.7,32.7'},
  {code:'NI',name:'Nicaragua',english:'Nicaragua',lat:12.87,lon:-85.21,zoom:7,bbox:'-87.7,10.7,-82.5,15.1'},
  {code:'PA',name:'Panamá',english:'Panama',lat:8.54,lon:-80.78,zoom:7,bbox:'-83.1,7.1,-77.1,9.7'},
  {code:'PY',name:'Paraguay',english:'Paraguay',lat:-23.44,lon:-58.44,zoom:6,bbox:'-62.7,-27.6,-54.2,-19.3'},
  {code:'PE',name:'Perú',english:'Peru',lat:-9.19,lon:-75.02,zoom:5,bbox:'-81.4,-18.4,-68.7,0.0'},
  {code:'SR',name:'Surinam',english:'Suriname',lat:3.92,lon:-56.03,zoom:6,bbox:'-58.1,1.8,-53.9,6.1'},
  {code:'TT',name:'Trinidad y Tobago',english:'Trinidad and Tobago',lat:10.69,lon:-61.22,zoom:8,bbox:'-62.0,10.0,-60.5,11.4'},
  {code:'UY',name:'Uruguay',english:'Uruguay',lat:-32.52,lon:-55.77,zoom:6,bbox:'-58.5,-35.0,-53.1,-30.1'},
  {code:'ES',name:'España',english:'Spain',lat:40.46,lon:-3.75,zoom:5},
  {code:'PT',name:'Portugal',english:'Portugal',lat:39.40,lon:-8.22,zoom:6},
  {code:'US',name:'Estados Unidos',english:'United States',lat:37.09,lon:-95.71,zoom:4},
  {code:'CA',name:'Canadá',english:'Canada',lat:56.13,lon:-106.35,zoom:3}
];
let countries=[...FALLBACK_COUNTRIES];
let activeCountryCode='VE';
let activeCountryBounds=null;
let serverCountryScoped=false;

function stripMarks(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
function countryByCode(code=activeCountryCode){return countries.find(c=>c.code===code)||FALLBACK_COUNTRIES.find(c=>c.code===code)||FALLBACK_COUNTRIES[0]}
function countryName(){return countryByCode().name}
function countryAliases(c=countryByCode()){return [...new Set([c.name,c.english,...(c.aliases||[])].filter(Boolean))]}
function parseCountryBounds(value){
  if(!value)return null;
  if(typeof value==='object'&&['west','south','east','north'].every(k=>Number.isFinite(Number(value[k]))))return{west:Number(value.west),south:Number(value.south),east:Number(value.east),north:Number(value.north)};
  const p=String(value).split(',').map(Number);
  return p.length===4&&p.every(Number.isFinite)?{west:p[0],south:p[1],east:p[2],north:p[3]}:null;
}
function pointInCountryBounds(lat,lon){
  const b=activeCountryBounds,la=Number(lat),lo=Number(lon);
  return !!b&&Number.isFinite(la)&&Number.isFinite(lo)&&la>=b.south&&la<=b.north&&lo>=b.west&&lo<=b.east;
}
function countryMatches(x){
  const c=countryByCode();
  const rawCode=text(first(x.countryCode,x.raw?.countryCode,x.raw?.country_code,x.raw?.iso2,x.raw?.iso_code,x.raw?.cca2)).toUpperCase();
  if(rawCode===c.code)return true;
  const hay=stripMarks([x.country,x.title,x.desc].join(' '));
  if(countryAliases(c).some(a=>hay.includes(stripMarks(a))))return true;
  return pointInCountryBounds(x.lat,x.lon);
}
function applyCountryContext(payload){
  const ctx=payload?.country_context;
  serverCountryScoped=!!payload?.country_scoped;
  if(!ctx)return;
  activeCountryBounds=parseCountryBounds(ctx.bounds||ctx.bbox)||activeCountryBounds;
  const c=countryByCode();
  if(Number.isFinite(Number(ctx.lat)))c.lat=Number(ctx.lat);
  if(Number.isFinite(Number(ctx.lon)))c.lon=Number(ctx.lon);
  if(ctx.bbox)c.bbox=ctx.bbox;
}
function focusCountry({animate=true}={}){
  const c=countryByCode();
  const lat=Number(c.lat),lon=Number(c.lon);
  if(Number.isFinite(lat)&&Number.isFinite(lon))map.setView([lat,lon],Number(c.zoom)||5,{animate});
}
function updateCountryUi(){
  const c=countryByCode();
  const focus=$('#countryFocusTitle');if(focus)focus.textContent=c.name;
  const impact=$('#impactCountryLabel');if(impact)impact.textContent=c.name;
}
function populateCountrySelect(){
  const select=$('#countryFilter');if(!select)return;
  const sorted=[...countries].filter(c=>c.code!=='VE').sort((a,b)=>a.name.localeCompare(b.name,'es',{sensitivity:'base'}));
  select.innerHTML=[countryByCode('VE'),...sorted].map(c=>`<option value="${esc(c.code)}">${esc(c.name)}</option>`).join('');
  select.value=activeCountryCode;
}
async function loadCountries(){
  activeCountryBounds=parseCountryBounds(countryByCode().bbox);
  populateCountrySelect();updateCountryUi();
  try{
    const r=await fetch('https://restcountries.com/v3.1/all?fields=cca2,name,translations,latlng,area',{headers:{Accept:'application/json'}});
    if(!r.ok)throw new Error('countries');
    const data=await r.json();
    const fallbackMap=new Map(FALLBACK_COUNTRIES.map(c=>[c.code,c]));
    const remote=data.map(c=>{
      const code=String(c.cca2||'').toUpperCase();if(!code)return null;
      const base=fallbackMap.get(code)||{};
      return{
        ...base,code,
        name:c?.translations?.spa?.common||c?.name?.common||base.name||code,
        english:c?.name?.common||base.english||'',
        aliases:[c?.name?.official,c?.translations?.spa?.official].filter(Boolean),
        lat:Number(c?.latlng?.[0]??base.lat??0),
        lon:Number(c?.latlng?.[1]??base.lon??0),
        zoom:base.zoom||5,
        area:Number(c?.area||0)
      };
    }).filter(Boolean);
    if(remote.length>150){countries=remote;populateCountrySelect();updateCountryUi()}
  }catch(e){console.warn('Catálogo internacional de países no disponible; se usa respaldo regional.',e)}
}

const impactDomains={
  workers:{label:'Trabajadores',icon:'👷'},
  facilities:{label:'Instalaciones',icon:'🏭'},
  mobility:{label:'Movilidad',icon:'🚚'},
  services:{label:'Servicios',icon:'⚡'},
  communications:{label:'Comunicaciones',icon:'📡'},
  continuity:{label:'Continuidad',icon:'🔄'}
};

let activeFeed='natural';
let rawItems=[];
let markers=[];
let providerMode='';
let selectedImpactId='';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];

const map=L.map('map',{zoomControl:false,worldCopyJump:true,minZoom:2}).setView([6.42,-66.59],5);
L.control.zoom({position:'bottomright'}).addTo(map);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  maxZoom:18,
  attribution:'© OpenStreetMap contributors'
}).addTo(map);
const markerLayer=L.layerGroup().addTo(map);

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
  return Number.isNaN(d.getTime())?'':d.toLocaleString('es',{dateStyle:'medium',timeStyle:'short'});
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
    countryCode:text(first(o.countryCode,o.country_code,o.iso2,o.iso_code,o.cca2)),
    severity:severityOf(o),time:timeOf(o),raw:o
  };
}

function inScope(x){return serverCountryScoped?true:countryMatches(x)}

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
  const kind=eventKind(x);
  const level=x.severity==='critical'?'high':x.severity==='warning'?'medium':'low';
  const score=level==='high'?8:level==='medium'?5:2;
  const matched=countryMatches(x);
  const confidence=(matched&&x.lat!==null&&x.lon!==null)?'alta':matched?'media-alta':'media';
  const proximity=matched?`En el foco territorial de ${countryName()}`:`Revisar relación territorial con ${countryName()}`;
  const domains=impactDomainsFor(kind);
  const summary={
    high:`Señal de prioridad alta para ${countryName()}; requiere verificación rápida de exposición real, instalaciones, rutas y servicios.`,
    medium:`Señal que merece seguimiento en ${countryName()} si coincide con trabajadores, sedes, rutas o servicios expuestos.`,
    low:`Señal informativa en ${countryName()}; mantener vigilancia y confirmar si existe exposición ocupacional real.`
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
function proximityLabel(x){return countryMatches(x)?countryName():'Contexto regional'}

function gdrThreatCode(x){
  const kind=eventKind(x);
  const s=[x.title,x.desc].join(' ').toLowerCase();
  if(kind==='earthquake')return'SISMO';
  if(kind==='flood')return'INUNDACION';
  if(kind==='landslide')return'DESLIZAMIENTO';
  if(kind==='outage')return'FALLA_TELECOMUNICACIONES';
  if(kind==='storm'){
    if(/tormenta el[eé]ctrica|lightning|thunderstorm|rayos?/.test(s))return'TORMENTA_ELECTRICA';
    if(/lluvia intensa|heavy rain|precipitaci[oó]n intensa/.test(s))return'LLUVIA_INTENSA';
    if(/vientos? fuertes?|strong wind|high wind|wind gust/.test(s))return'VIENTOS_FUERTES';
  }
  return'';
}

function gdrObservedDate(x){
  const raw=x?.raw||{};
  const v=first(raw.timestamp,raw.date,raw.occurredAt,raw.updatedAt,raw.startedAt,raw.time);
  if(!v)return'';
  const d=new Date(typeof v==='number'&&v<1e12?v*1000:v);
  return Number.isNaN(d.getTime())?'':d.toISOString().slice(0,10);
}

function gdrSourceType(x){
  const s=String(x?.source||'').toLowerCase();
  if(/usgs|nasa|noaa|gdacs|onu|comisi[oó]n europea|safecast|georgia tech|ioda/.test(s))return'AUTORIDAD';
  return'DOCUMENTO_TECNICO';
}

function buildGdrUrl(x){
  if(x?.lat===null||x?.lon===null||!Number.isFinite(Number(x?.lat))||!Number.isFinite(Number(x?.lon)))return'';
  const url=new URL('https://gdr.movidasst.com/');
  const threatCode=gdrThreatCode(x);
  const intensity=x.severity==='critical'?'ALTA':x.severity==='warning'?'MEDIA':'BAJA';
  const technical=[
    String(x.desc||'').slice(0,650),
    x.source?`Fuente de monitoreo: ${x.source}`:'',
    x.time?`Fecha/hora mostrada por el Monitor: ${x.time}`:'',
    x.url?`Fuente original: ${x.url}`:'',
    'Señal transferida desde el Monitor SST de La Movida. Debe verificarse la exposición, la ubicación y la categoría antes de publicarla en GDR.'
  ].filter(Boolean).join('\n');

  url.searchParams.set('accion','registrar');
  url.searchParams.set('origen','monitor-sst');
  url.searchParams.set('tipo','AMENAZA');
  url.searchParams.set('lat',String(Number(x.lat).toFixed(6)));
  url.searchParams.set('lng',String(Number(x.lon).toFixed(6)));
  url.searchParams.set('titulo',String(x.title||'Señal del Monitor SST').slice(0,120));
  url.searchParams.set('descripcion',technical.slice(0,1450));
  url.searchParams.set('estado_temporal','ACTIVA');
  url.searchParams.set('intensidad',intensity);
  url.searchParams.set('fuente_tipo',gdrSourceType(x));
  const date=gdrObservedDate(x);
  if(date)url.searchParams.set('fecha',date);
  if(threatCode)url.searchParams.set('amenaza_codigo',threatCode);
  return url.toString();
}

function renderImpactDetail(x){
  const box=$('#impactDetail');
  if(!box)return;
  if(!x){
    box.innerHTML='<div class="impact-empty"><strong>Selecciona una señal</strong><p>Toca una tarjeta del listado para ver su lectura de impacto potencial en el país seleccionado.</p></div>';
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
    ${buildGdrUrl(x)?`<a class="gdr-action" href="${esc(buildGdrUrl(x))}" target="_blank" rel="noopener">🗺️ Registrar / analizar esta amenaza en GDR ↗</a>`:'' }
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
  $('#statScope').textContent=countryName();
  $('#mapScopeTitle').textContent=countryName();
  $('#panelTitle').textContent=`${feedMeta[activeFeed].title} · ${countryName()}`;
  renderImpactDashboard(items);

  const list=$('#feedList');
  markerLayer.clearLayers();
  markers=[];

  if(!items.length){
    list.innerHTML=`<div class="empty"><span>✓</span><strong>Consulta completada para ${esc(countryName())}.</strong><p>No hay señales activas en esta capa con las fuentes disponibles ahora. Esto no significa que exista una emergencia ni que la conexión haya fallado. Prueba otra capa para ver exposición, conectividad o radiación.</p></div>`;
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
      <button class="impact-open" type="button">Ver impacto del país →</button>
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
  const points=filtered().filter(x=>x.lat!==null&&x.lon!==null).map(x=>[x.lat,x.lon]);
  if(points.length>1){map.fitBounds(points,{padding:[28,28],maxZoom:7,animate:true});return}
  if(points.length===1){map.setView(points[0],7,{animate:true});return}
  focusCountry();
}

function updateProvider(payload){
  providerMode=payload?.provider_mode||'';
  const el=$('#providerMode');
  if(providerMode==='osiris-fallback'||payload?.osiris_fallback_used){
    el.textContent='OSIRIS activó respaldo de datos';
  }else if(providerMode==='direct-sources'){
    el.textContent='Fuentes directas verificables';
  }else{
    el.textContent='Fuentes de inteligencia situacional';
  }
}

async function loadFeed(feed=activeFeed){
  activeFeed=feed;
  selectedImpactId='';
  $('#panelTitle').textContent=`${feedMeta[feed].title} · ${countryName()}`;
  $('#mapScopeTitle').textContent=countryName();
  $('#statScope').textContent=countryName();
  $('#feedList').innerHTML='<div class="empty loading"><span></span><strong>Consultando señales…</strong></div>';
  $('#livePill').classList.remove('online');
  $('#livePill b').textContent='Actualizando';

  try{
    const c=countryByCode();
    const qs=new URLSearchParams({feed,country:c.name,country_code:c.code});
    if(Number.isFinite(Number(c.lat)))qs.set('lat',String(c.lat));
    if(Number.isFinite(Number(c.lon)))qs.set('lon',String(c.lon));
    if(c.bbox)qs.set('bbox',c.bbox);
    const r=await fetch(`${API}?${qs.toString()}`,{headers:{Accept:'application/json'}});
    const payload=await r.json().catch(()=>({}));
    if(!r.ok){
      const err=new Error(payload?.error||`HTTP ${r.status}`);
      err.code=payload?.error;
      throw err;
    }
    updateProvider(payload);
    applyCountryContext(payload);
    rawItems=pickArray(payload.data??payload).map(normalize);
    $('#statTime').textContent=new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'});
    $('#livePill').classList.add('online');
    $('#livePill b').textContent='En vivo';
    render();
    recenter();
    const visible=filtered().length;
    if(!visible){
      $('#providerMode').textContent=`Consulta completada · sin señales activas de ${feedMeta[feed].title.toLowerCase()} para ${countryName()}`;
      toast(`Consulta completada: no hay señales activas para ${countryName()} en esta capa`);
    }
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
    focusCountry();
    toast('No se pudo actualizar esta capa');
    console.error(e);
  }
}

$$('.feed-tab').forEach(btn=>btn.addEventListener('click',()=>{
  $$('.feed-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  loadFeed(btn.dataset.feed);
}));

$('#countryFilter').addEventListener('change',()=>{
  activeCountryCode=$('#countryFilter').value||'VE';
  activeCountryBounds=parseCountryBounds(countryByCode().bbox);
  serverCountryScoped=false;
  selectedImpactId='';
  rawItems=[];
  updateCountryUi();
  focusCountry();
  markerLayer.clearLayers();
  $('#resultCount').textContent='—';
  $('#feedList').innerHTML=`<div class="empty loading"><span></span><strong>Consultando ${countryName()}…</strong><p>Buscando señales y contexto territorial del país seleccionado.</p></div>`;
  loadFeed(activeFeed);
});

$('#searchInput').addEventListener('input',()=>{selectedImpactId='';render();});
$('#severityFilter').addEventListener('change',()=>{selectedImpactId='';render();});
$('#refreshBtn').addEventListener('click',()=>loadFeed());
$('#recenterBtn').addEventListener('click',recenter);

loadCountries().finally(()=>{focusCountry({animate:false});loadFeed()});
