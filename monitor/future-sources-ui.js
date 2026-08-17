/* Activación progresiva de OpenAQ, HDX y NOAA SWPC cuando el backend los soporte. */
(() => {
  const API='https://lfdmbkzghnwvsapxypvt.supabase.co/functions/v1/world-monitor-sst';
  const cache=new Map();

  function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
  function fmt(v,d=1){const x=n(v);return x===null?'—':x.toFixed(d)}
  function esc2(v){return String(v??'').replace(/[&<>'\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[m]))}
  function setBadge(id,text,cls='active'){
    const el=document.querySelector(`[data-source-id="${id}"] .source-status`);
    if(!el)return;
    el.textContent=text; el.className=`source-status ${cls}`;
  }
  function installCss(){
    if(document.querySelector('#future-source-css'))return;
    const s=document.createElement('style'); s.id='future-source-css';
    s.textContent=`
      .openaq-nearby{margin-top:9px;padding:9px;border:1px solid #cbe5e7;background:#f5fbfb;border-radius:12px}
      .openaq-nearby>b{display:block;color:#007b85;font-size:11px;margin-bottom:5px}.openaq-station{font-size:10px;color:#64748b;margin:0 0 7px;line-height:1.35}
      .openaq-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:5px}.openaq-grid span{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:6px;display:grid}
      .openaq-grid strong{color:#00205b;font-size:11px}.openaq-grid small{font-size:8px;color:#64748b}.openaq-note{font-size:9px!important;color:#64748b!important;margin:7px 0 0!important;background:none!important;padding:0!important}
      .feed-tab.space-weather-tab>span{font-size:20px}
    `;
    document.head.appendChild(s);
  }

  async function getHealth(){
    try{const r=await fetch(`${API}?feed=health`,{headers:{Accept:'application/json'}});return r.ok?await r.json():null}catch{return null}
  }
  async function probe(feed,extra=''){
    try{const r=await fetch(`${API}?feed=${encodeURIComponent(feed)}${extra}`,{headers:{Accept:'application/json'}});return r.ok?await r.json():null}catch{return null}
  }

  function prettyParam(m){
    const p=String(m.parameter||m.display_name||'').toLowerCase();
    if(p.includes('pm25')||p.includes('pm2.5'))return'PM2.5';
    if(p.includes('pm10'))return'PM10';
    if(p==='o3'||p.includes('ozone'))return'O₃';
    if(p==='no2'||p.includes('nitrogen'))return'NO₂';
    if(p==='so2'||p.includes('sulfur'))return'SO₂';
    if(p==='co'||p.includes('carbon monoxide'))return'CO';
    return m.display_name||m.parameter||'Medición';
  }

  async function openAqFor(x){
    if(x?.lat==null||x?.lon==null)return null;
    const key=`${Number(x.lat).toFixed(3)},${Number(x.lon).toFixed(3)}`;
    if(cache.has(key))return cache.get(key);
    const p=await probe('openaq',`&lat=${encodeURIComponent(x.lat)}&lon=${encodeURIComponent(x.lon)}`);
    const data=p?.data||p;
    cache.set(key,data||null); return data||null;
  }

  async function enrichPopup(popup){
    const source=popup?._source;
    const entry=Array.isArray(markers)?markers.find(m=>m.marker===source):null;
    const x=entry?rawItems.find(i=>i.id===entry.id):null;
    if(!x||x.lat==null||x.lon==null)return;
    const root=popup.getElement()?.querySelector('.sst-popup,.popup-card');
    if(!root||root.querySelector('.openaq-nearby'))return;
    const box=document.createElement('section');box.className='openaq-nearby';
    box.innerHTML='<b>🌫️ OpenAQ · medición ambiental cercana</b><p class="openaq-station">Buscando estación o sensor hasta 25 km…</p>';
    const anchor=root.querySelector('.popup-check,.popup-source');
    if(anchor)root.insertBefore(box,anchor);else root.appendChild(box);
    const data=await openAqFor(x);
    if(!document.body.contains(box))return;
    if(!data?.station){
      box.innerHTML='<b>🌫️ OpenAQ · medición ambiental cercana</b><p class="openaq-station">No se encontró una estación OpenAQ dentro de 25 km de esta señal.</p>';
      return;
    }
    const ms=(data.measurements||[]).filter(m=>n(m.value)!==null).slice(0,6);
    const dist=n(data.station.distance_km);
    const provider=data.station.provider?` · ${esc2(data.station.provider)}`:'';
    box.innerHTML=`<b>🌫️ OpenAQ · medición ambiental cercana</b>
      <p class="openaq-station"><strong>${esc2(data.station.name||'Estación OpenAQ')}</strong>${dist!==null?` · ≈ ${fmt(dist)} km`:''}${provider}</p>
      ${ms.length?`<div class="openaq-grid">${ms.map(m=>`<span><strong>${fmt(m.value)} ${esc2(m.units||'')}</strong><small>${esc2(prettyParam(m))}</small></span>`).join('')}</div>`:'<p class="openaq-station">La estación existe, pero no devolvió mediciones recientes utilizables.</p>'}
      <p class="openaq-note">Medición ambiental de estación/sensor. No sustituye muestreo de higiene ocupacional en el puesto de trabajo.</p>`;
  }

  function enableOpenAQ(){
    if(window.__movidaOpenAQEnabled)return; window.__movidaOpenAQEnabled=true;
    map.on('popupopen',e=>enrichPopup(e.popup));
    setBadge('openaq','Activo · estación cercana ≤25 km','active');
  }

  async function enableSpaceWeather(){
    if(document.querySelector('.feed-tab[data-feed="space"]'))return;
    const p=await probe('space'); if(!p)return;
    feedMeta.space={title:'Clima espacial',action:'Revisar continuidad de GPS, comunicaciones HF, navegación, sincronización y servicios dependientes de infraestructura espacial.'};
    const nav=document.querySelector('.feed-tabs');if(!nav)return;
    const btn=document.createElement('button');
    btn.className='feed-tab space-weather-tab';btn.dataset.feed='space';btn.type='button';
    btn.innerHTML='<span>🛰️</span><b>Clima espacial</b><small>GPS, radio y continuidad</small>';
    btn.addEventListener('click',async()=>{
      document.querySelectorAll('.feed-tab').forEach(b=>b.classList.toggle('active',b===btn));
      await loadFeed('space');
    });
    nav.appendChild(btn); setBadge('swpc','Activo · NOAA SWPC','active');
  }

  async function init(){
    installCss();
    const h=await getHealth(); if(!h)return;
    if(h.openaq_api_key_configured){
      const test=await probe('openaq','&lat=10.4806&lon=-66.9036');
      if(test){enableOpenAQ()}else setBadge('openaq','Clave configurada · sin cobertura/prueba','ready');
    }
    if(h.hdx_hapi_app_identifier_configured){
      const test=await probe('hdx','&location_code=VEN');
      setBadge('hdx',test?'Activo · contexto territorial':'Identificador configurado · revisar endpoint',test?'active':'ready');
    }
    const sources=(h.natural_sources||[]).join(' ');
    if(/GDACS/i.test(sources))setBadge('gdacs','Activo · feed GDACS','active');
    if(/NHC/i.test(sources))setBadge('nhc','Activo · NOAA/NHC','active');
    if(/Tsunami/i.test(sources))setBadge('tsunami','Activo · NOAA CAP','active');
    await enableSpaceWeather();
  }
  init();
})();
