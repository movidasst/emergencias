const API='https://lfdmbkzghnwvsapxypvt.supabase.co/functions/v1/world-monitor-sst';
const feedMeta={natural:{title:'Eventos naturales'},outages:{title:'Infraestructura y conectividad'},radiation:{title:'Radiación'},air:{title:'Calidad ambiental'}};
let activeFeed='natural',rawItems=[],markers=[];

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const map=L.map('map',{zoomControl:false,worldCopyJump:true}).setView([12,-66],3);
L.control.zoom({position:'bottomright'}).addTo(map);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap contributors'}).addTo(map);
const markerLayer=L.layerGroup().addTo(map);

function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2600)}
function text(v){return String(v??'').trim()}
function first(...vals){return vals.find(v=>v!==undefined&&v!==null&&String(v).trim()!=='')}
function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function cleanUrl(v){try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return''}}
function pickArray(payload){if(Array.isArray(payload))return payload;for(const k of ['events','observations','outages','services','items','results','data']){if(Array.isArray(payload?.[k]))return payload[k]}for(const v of Object.values(payload||{})){if(Array.isArray(v))return v}return[]}
function severityOf(o){const s=text(first(o.alertLevel,o.alert_level,o.severity,o.level,o.status,o.riskLevel,o.risk_level)).toLowerCase();if(/red|critical|major|severe|extreme|high|danger|outage/.test(s))return'critical';if(/orange|yellow|warning|watch|moderate|degraded|elevated/.test(s))return'warning';return'advisory'}
function coordsOf(o){const loc=o.location||o.coordinates||o.geometry||{};let lat=first(loc.latitude,loc.lat,o.latitude,o.lat),lon=first(loc.longitude,loc.lon,loc.lng,o.longitude,o.lon,o.lng);if(Array.isArray(loc.coordinates)){lon=first(lon,loc.coordinates[0]);lat=first(lat,loc.coordinates[1])}return{lat:n(lat),lon:n(lon)}}
function timeOf(o){const v=first(o.occurredAt,o.updatedAt,o.startedAt,o.date,o.time,o.timestamp,o.createdAt,o.updated_at);if(!v)return'';const d=new Date(typeof v==='number'&&v<1e12?v*1000:v);return Number.isNaN(d.getTime())?'':d.toLocaleString('es-VE',{dateStyle:'medium',timeStyle:'short'})}
function normalize(o,i){const c=coordsOf(o);const title=text(first(o.title,o.name,o.eventType,o.event_type,o.type,o.label,o.service,o.station,'Señal sin título'));const country=text(first(o.country,o.countryName,o.country_name,o.admin1,o.region,o.location?.country,o.location?.name));const desc=text(first(o.description,o.summary,o.details,o.message,o.statusMessage,o.status_message,o.sourceDescription));const source=text(first(o.source,o.provider,o.sources?.[0],o.network,'World Monitor'));const url=cleanUrl(first(o.url,o.link,o.sourceUrl,o.source_url));return{id:text(first(o.id,o.eventId,o.event_id,`${activeFeed}-${i}`)),title,country,desc,source,url,lat:c.lat,lon:c.lon,severity:severityOf(o),time:timeOf(o),raw:o}}
function severityLabel(s){return s==='critical'?'Crítica':s==='warning'?'Alerta':'Informativa'}
function markerColor(s){return s==='critical'?'#c0392b':s==='warning'?'#d97706':'#3f8f3a'}
function esc(s){return text(s).replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]))}
function filtered(){const q=$('#searchInput').value.trim().toLowerCase(),sev=$('#severityFilter').value;return rawItems.filter(x=>(sev==='all'||x.severity===sev)&&(!q||[x.title,x.country,x.desc,x.source].join(' ').toLowerCase().includes(q)))}
function render(){const items=filtered();$('#resultCount').textContent=items.length;$('#statTotal').textContent=items.length;$('#statCritical').textContent=items.filter(x=>x.severity==='critical').length;$('#statCountries').textContent=new Set(items.map(x=>x.country).filter(Boolean)).size||'—';const list=$('#feedList');markerLayer.clearLayers();markers=[];
  if(!items.length){list.innerHTML='<div class="empty">No hay señales que coincidan con los filtros.</div>';return}
  list.innerHTML=items.map((x,idx)=>`<article class="event-card" data-id="${esc(x.id)}"><div class="event-top"><h4>${esc(x.title)}</h4><span class="severity ${x.severity}">${severityLabel(x.severity)}</span></div><p class="event-meta">${esc([x.country,x.time,x.source].filter(Boolean).join(' · '))}</p>${x.desc?`<p class="event-desc">${esc(x.desc.slice(0,180))}${x.desc.length>180?'…':''}</p>`:''}</article>`).join('');
  items.forEach(x=>{if(x.lat===null||x.lon===null)return;const marker=L.circleMarker([x.lat,x.lon],{radius:8,color:'#fff',weight:2,fillColor:markerColor(x.severity),fillOpacity:.92});marker.bindPopup(`<strong>${esc(x.title)}</strong><br>${esc(x.country)}<br><small>${esc(x.source)}${x.time?' · '+esc(x.time):''}</small>${x.url?`<br><a href="${esc(x.url)}" target="_blank" rel="noopener">Abrir fuente</a>`:''}`);marker.addTo(markerLayer);markers.push({id:x.id,marker})});
  $$('.event-card').forEach(el=>el.addEventListener('click',()=>{const x=items.find(i=>i.id===el.dataset.id);if(!x)return;const m=markers.find(m=>m.id===x.id);if(m){map.setView(m.marker.getLatLng(),Math.max(map.getZoom(),6),{animate:true});m.marker.openPopup()}else if(x.url)window.open(x.url,'_blank','noopener')}));
}
async function loadFeed(feed=activeFeed){activeFeed=feed;$('#panelTitle').textContent=feedMeta[feed].title;$('#feedList').innerHTML='<div class="empty">Consultando señales…</div>';$('#livePill').classList.remove('online');$('#livePill b').textContent='Actualizando';
  try{const r=await fetch(`${API}?feed=${encodeURIComponent(feed)}`,{headers:{'Accept':'application/json'}});const payload=await r.json().catch(()=>({}));if(!r.ok)throw new Error(payload?.error||`HTTP ${r.status}`);rawItems=pickArray(payload.data??payload).map(normalize);$('#statTime').textContent=new Date().toLocaleTimeString('es-VE',{hour:'2-digit',minute:'2-digit'});$('#livePill').classList.add('online');$('#livePill b').textContent='En vivo';render();if(rawItems.length)fitMap();else toast('Fuente disponible, sin señales para mostrar');}
  catch(e){rawItems=[];render();$('#statTime').textContent='—';$('#livePill b').textContent='Sin conexión';toast(e.message==='WORLD_MONITOR_API_KEY_NOT_CONFIGURED'?'Falta configurar la clave segura de World Monitor en Supabase':'No se pudo consultar World Monitor');console.error(e)}
}
function fitMap(){const pts=rawItems.filter(x=>x.lat!==null&&x.lon!==null).map(x=>[x.lat,x.lon]);if(pts.length===1)map.setView(pts[0],6);else if(pts.length>1)map.fitBounds(pts,{padding:[30,30],maxZoom:7})}
$$('.feed-tab').forEach(btn=>btn.addEventListener('click',()=>{$$('.feed-tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');loadFeed(btn.dataset.feed)}));
$('#searchInput').addEventListener('input',render);$('#severityFilter').addEventListener('change',render);$('#refreshBtn').addEventListener('click',()=>loadFeed());
loadFeed();
