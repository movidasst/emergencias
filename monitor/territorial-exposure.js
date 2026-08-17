/* Contexto territorial SST con OpenStreetMap/Overpass vía Edge Function osm-servicios. */
(() => {
  const OSM_API='https://lfdmbkzghnwvsapxypvt.supabase.co/functions/v1/osm-servicios';
  const RADIUS_M=5000;
  const CATEGORIES=['hospital','clinic','doctors','healthcare','ambulance','fire','police','fuel','pharmacy','school','kindergarten','university'];
  const cache=new Map();
  const baseImpactDetail=renderImpactDetail;

  function num(v){const n=Number(v);return Number.isFinite(n)?n:null}
  function safe(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  function keyFor(x){return `${Number(x.lat).toFixed(4)},${Number(x.lon).toFixed(4)}`}
  function distKm(a,b,c,d){
    if(typeof haversine==='function')return haversine(a,b,c,d);
    const r=v=>v*Math.PI/180,R=6371,dl=r(c-a),dn=r(d-b);
    const h=Math.sin(dl/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(dn/2)**2;
    return 2*R*Math.asin(Math.sqrt(h));
  }
  function typeOf(p){return String(p?.tipo??p?.type??p?.category??p?.amenity??'').toLowerCase()}
  function labelOf(t){
    if(/hospital/.test(t))return{icon:'🏥',label:'Hospital'};
    if(/clinic|doctors|healthcare|ambulance/.test(t))return{icon:'🩺',label:'Salud'};
    if(/fire|bombero/.test(t))return{icon:'🚒',label:'Bomberos'};
    if(/police|polic/.test(t))return{icon:'🚓',label:'Policía'};
    if(/fuel|combustible|gas_station/.test(t))return{icon:'⛽',label:'Combustible'};
    if(/pharmacy|farmacia/.test(t))return{icon:'💊',label:'Farmacia'};
    if(/school|kindergarten|university|colegio|escuela|universidad/.test(t))return{icon:'🏫',label:'Centro educativo'};
    return{icon:'📍',label:'Servicio'};
  }
  function normalizePlace(p,x){
    const lat=num(p?.lat??p?.latitude),lon=num(p?.lng??p?.lon??p?.longitude);
    if(lat===null||lon===null)return null;
    const kind=labelOf(typeOf(p));
    return{
      name:String(p?.nombre??p?.name??kind.label).trim()||kind.label,
      type:kind.label,icon:kind.icon,lat,lon,
      km:distKm(x.lat,x.lon,lat,lon)
    };
  }
  async function fetchContext(x){
    if(x?.lat==null||x?.lon==null)return null;
    const key=keyFor(x);if(cache.has(key))return cache.get(key);
    try{
      const r=await fetch(OSM_API,{
        method:'POST',
        headers:{'Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify({action:'CONTEXTO',lat:x.lat,lng:x.lon,radius:RADIUS_M,categories:CATEGORIES})
      });
      if(!r.ok)throw new Error(`HTTP_${r.status}`);
      const p=await r.json().catch(()=>({}));
      const raw=Array.isArray(p?.places)?p.places:Array.isArray(p?.data)?p.data:[];
      const places=raw.map(v=>normalizePlace(v,x)).filter(Boolean).sort((a,b)=>a.km-b.km);
      const out={available:true,places,source:'OpenStreetMap / Overpass',radius_m:RADIUS_M};
      cache.set(key,out);return out;
    }catch(e){
      const out={available:false,places:[],error:String(e?.message||e)};
      cache.set(key,out);return out;
    }
  }
  function grouped(places){
    const m=new Map();for(const p of places){if(!m.has(p.type))m.set(p.type,[]);m.get(p.type).push(p)}return m;
  }
  function territorialReading(x,places){
    if(!places.length)return 'No se identificaron servicios de las categorías consultadas dentro de 5 km. Esto no demuestra ausencia de infraestructura: OpenStreetMap puede tener cobertura incompleta.';
    const kind=typeof eventKind==='function'?eventKind(x):'other';
    const fuel=places.find(p=>p.type==='Combustible');
    const fire=places.find(p=>p.type==='Bomberos');
    const health=places.find(p=>p.type==='Hospital'||p.type==='Salud');
    const school=places.find(p=>p.type==='Centro educativo');
    const notes=[];
    if(fuel&&['wildfire','storm','flood','earthquake','natural'].includes(kind))notes.push(`Hay un punto de combustible a ≈ ${fuel.km.toFixed(1)} km: verificar acceso, condiciones locales y posibles efectos secundarios antes de asumir afectación.`);
    if(health)notes.push(`El servicio de salud más próximo identificado está a ≈ ${health.km.toFixed(1)} km; puede ser relevante para capacidad de respuesta, no implica que esté afectado.`);
    if(fire)notes.push(`Bomberos identificados a ≈ ${fire.km.toFixed(1)} km como recurso territorial de referencia.`);
    if(school&&['wildfire','air','storm','flood'].includes(kind))notes.push(`Existe un centro educativo a ≈ ${school.km.toFixed(1)} km; considerar población sensible si la amenaza realmente alcanza esa zona.`);
    return notes.slice(0,3).join(' ')||`Se identificaron ${places.length} elementos territoriales dentro de 5 km. Úsalos para orientar verificación de exposición, respuesta y continuidad; la cercanía no confirma afectación.`;
  }
  function rowsHtml(places,limit=7){
    return places.slice(0,limit).map(p=>`<li><span>${p.icon}</span><div><b>${safe(p.name)}</b><small>${safe(p.type)} · ≈ ${p.km<1?(p.km*1000).toFixed(0)+' m':p.km.toFixed(1)+' km'}</small></div></li>`).join('');
  }
  function countsHtml(places){
    const g=grouped(places);return [...g.entries()].slice(0,5).map(([type,arr])=>`<span><b>${arr.length}</b>${safe(type)}</span>`).join('');
  }
  function territorialBlock(x,data){
    if(!data?.available)return `<section class="territorial-box unavailable"><div class="territorial-head"><b>🗺️ Contexto territorial · 5 km</b><span>OSM</span></div><p>No fue posible consultar OpenStreetMap/Overpass en este momento. La señal principal sigue siendo válida.</p></section>`;
    const places=data.places||[];
    return `<section class="territorial-box">
      <div class="territorial-head"><b>🗺️ Contexto territorial · radio 5 km</b><span>OpenStreetMap</span></div>
      ${places.length?`<div class="territorial-counts">${countsHtml(places)}</div><ul class="territorial-list">${rowsHtml(places)}</ul>`:'<p>No se encontraron elementos de las categorías consultadas dentro de 5 km.</p>'}
      <div class="territorial-reading"><b>Lectura SST territorial</b><p>${safe(territorialReading(x,places))}</p></div>
      <p class="territorial-caveat">La proximidad geográfica no confirma exposición, daño, ocupación ni estado operativo. OSM es una base colaborativa y su cobertura puede ser incompleta; verificar localmente antes de decidir.</p>
    </section>`;
  }
  function installCss(){
    if(document.querySelector('#territorial-exposure-css'))return;
    const s=document.createElement('style');s.id='territorial-exposure-css';s.textContent=`
      .territorial-box{margin-top:9px;padding:10px;border:1px solid #d7e4e9;background:linear-gradient(145deg,#f9fcfd,#fff);border-radius:12px;display:grid;gap:8px}.territorial-box.unavailable{opacity:.8}
      .territorial-head{display:flex;justify-content:space-between;gap:8px;align-items:center}.territorial-head>b{font-size:11px;color:#00205b}.territorial-head>span{font-size:8px;font-weight:800;color:#007b85;background:#eaf7f8;padding:4px 6px;border-radius:999px}
      .territorial-counts{display:flex;gap:5px;flex-wrap:wrap}.territorial-counts span{font-size:8px;color:#64748b;background:#fff;border:1px solid #e2e8f0;border-radius:999px;padding:4px 6px}.territorial-counts b{color:#00205b;margin-right:3px}
      .territorial-list{list-style:none!important;padding:0!important;margin:0!important;display:grid;gap:5px}.territorial-list li{display:grid;grid-template-columns:24px 1fr;gap:6px;align-items:center;padding:5px 6px;background:#fff;border:1px solid #edf2f5;border-radius:9px}.territorial-list li>span{font-size:14px}.territorial-list b{display:block;font-size:10px;color:#0f2740}.territorial-list small{display:block;font-size:8px;color:#64748b;margin-top:1px}
      .territorial-reading{border-left:3px solid #007b85;padding:7px 8px;background:#f5fbfb;border-radius:0 9px 9px 0}.territorial-reading>b{font-size:9px;color:#007b85;text-transform:uppercase;letter-spacing:.04em}.territorial-reading p,.territorial-box>p{font-size:9px!important;line-height:1.4!important;margin:3px 0 0!important;background:none!important;padding:0!important}.territorial-caveat{color:#64748b!important}
      .territorial-detail{margin:12px 0;border:1px solid #d7e4e9;border-radius:14px;padding:12px;background:#fbfdfe}.territorial-detail h5{margin:0 0 8px;color:#00205b;font-size:13px}.territorial-detail .territorial-list{grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
    `;document.head.appendChild(s);
  }
  function currentFromPopup(popup){
    const src=popup?._source;const entry=Array.isArray(markers)?markers.find(m=>m.marker===src):null;
    return entry?rawItems.find(i=>i.id===entry.id):null;
  }
  async function hydratePopup(popup){
    const x=currentFromPopup(popup);if(!x||x.lat==null||x.lon==null)return;
    const root=popup.getElement()?.querySelector('.sst-popup,.popup-card');if(!root)return;
    let box=root.querySelector('.territorial-box');if(box)return;
    box=document.createElement('section');box.className='territorial-box';box.innerHTML='<div class="territorial-head"><b>🗺️ Contexto territorial · 5 km</b><span>OSM</span></div><p>Consultando infraestructura y servicios próximos…</p>';
    const anchor=root.querySelector('.popup-check,.popup-source');if(anchor)root.insertBefore(box,anchor);else root.appendChild(box);
    const data=await fetchContext(x);if(!document.body.contains(box))return;
    const tmp=document.createElement('div');tmp.innerHTML=territorialBlock(x,data);box.replaceWith(tmp.firstElementChild);
  }
  renderImpactDetail=function(x){
    baseImpactDetail(x);if(!x||x.lat==null||x.lon==null)return;
    const root=document.querySelector('#impactDetail');if(!root)return;
    const holder=document.createElement('section');holder.className='territorial-detail';holder.innerHTML='<h5>🗺️ Exposición territorial cercana</h5><p>Consultando OpenStreetMap/Overpass en un radio de 5 km…</p>';
    const actions=root.querySelector('.impact-actions');if(actions)root.insertBefore(holder,actions);else root.appendChild(holder);
    fetchContext(x).then(data=>{
      if(!document.body.contains(holder))return;
      holder.innerHTML=`<h5>🗺️ Exposición territorial cercana · 5 km</h5>${data?.available?(data.places?.length?`<div class="territorial-counts">${countsHtml(data.places)}</div><ul class="territorial-list">${rowsHtml(data.places,10)}</ul><div class="territorial-reading"><b>Lectura SST territorial</b><p>${safe(territorialReading(x,data.places))}</p></div>`:'<p>No se identificaron servicios de las categorías consultadas en este radio.</p>'):'<p>OpenStreetMap/Overpass no estuvo disponible en esta consulta.</p>'}<p class="territorial-caveat">Cercanía ≠ afectación. Verificar exposición real, vulnerabilidad y estado operativo.</p>`;
    });
  };

  installCss();
  if(typeof map!=='undefined'&&map?.on)map.on('popupopen',e=>setTimeout(()=>hydratePopup(e.popup),20));
})();
