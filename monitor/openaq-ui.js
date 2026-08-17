/* Medición ambiental observada OpenAQ. Se activa cuando world-monitor-sst expone feed=openaq. */
(() => {
  const cache=new Map();

  function num(v){const n=Number(v);return Number.isFinite(n)?n:null}
  function fmt(v,d=1){const n=num(v);return n===null?'—':n.toFixed(d)}
  function escHtml(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  function safeId(v){return String(v||'x').replace(/[^a-zA-Z0-9_-]/g,'_')}
  function ageLabel(hours){
    const h=num(hours); if(h===null)return'Antigüedad no determinada';
    if(h<1)return'Medición de hace menos de 1 h';
    if(h<24)return`Medición de hace ≈ ${Math.round(h)} h`;
    return`Medición de hace ≈ ${Math.round(h/24)} d`;
  }
  function freshnessLabel(v){return v==='recent'?'reciente':v==='aging'?'con algunas horas':'antigua'}
  function itemForPopup(){
    const env=document.querySelector('.leaflet-popup .popup-environment[id^="sst-env-"]');
    if(!env)return null;
    return rawItems.find(x=>`sst-env-${safeId(x.id)}`===env.id)||null;
  }
  function parameterOrder(p){
    const order=['pm25','pm10','o3','no2','so2','co','bc','pm1','pm4'];
    const i=order.indexOf(String(p||'').toLowerCase()); return i<0?99:i;
  }
  function installStyles(){
    if(document.querySelector('#openaq-ui-styles'))return;
    const style=document.createElement('style'); style.id='openaq-ui-styles';
    style.textContent=`
      .openaq-observed{border:1px solid #cfe1ec;background:linear-gradient(145deg,#f8fcff,#fff);border-radius:12px;padding:10px;display:grid;gap:7px}
      .openaq-observed>div:first-child{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.openaq-observed b{color:#00205b;font-size:11px}.openaq-observed .oa-badge{font-size:8px;font-weight:800;color:#007b85;background:#eaf7f8;border-radius:999px;padding:4px 6px;white-space:nowrap}
      .oa-station{font-size:10px;line-height:1.35;color:#475569}.oa-station strong{display:block;color:#0f2740;font-size:11px}.oa-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:5px}.oa-grid span{background:#fff;border:1px solid #e2ebf0;border-radius:9px;padding:6px;display:grid;gap:1px}.oa-grid strong{font-size:12px;color:#0f2740}.oa-grid small{font-size:8px;color:#64748b}.oa-note{font-size:9px!important;line-height:1.35!important;margin:0!important;color:#64748b!important;background:none!important;padding:0!important}
    `;
    document.head.appendChild(style);
  }
  async function fetchObserved(x){
    if(x?.lat==null||x?.lon==null)return null;
    const key=`${Number(x.lat).toFixed(3)},${Number(x.lon).toFixed(3)}`;
    if(cache.has(key))return cache.get(key);
    try{
      const r=await fetch(`${API}?feed=openaq&lat=${encodeURIComponent(x.lat)}&lon=${encodeURIComponent(x.lon)}&radius=25000`,{headers:{Accept:'application/json'}});
      if(!r.ok){
        // Feed todavía no desplegado: no mostramos un falso error al usuario.
        if([400,404,502,503].includes(r.status))return null;
        return null;
      }
      const p=await r.json().catch(()=>({}));
      const data=p?.data||null;
      cache.set(key,data); return data;
    }catch{return null}
  }
  function renderObserved(root,data){
    if(!data?.available){
      root.innerHTML=`<div><b>📍 Medición ambiental observada</b><span class="oa-badge">OpenAQ</span></div><p class="oa-note">No se encontró una estación OpenAQ con medición disponible dentro de 25 km. El contexto de Open-Meteo/CAMS mostrado arriba sigue siendo modelado.</p>`;
      return;
    }
    const s=data.station||{};
    const rows=(Array.isArray(data.measurements)?data.measurements:[]).sort((a,b)=>parameterOrder(a.parameter)-parameterOrder(b.parameter)).slice(0,6);
    root.innerHTML=`
      <div><b>📍 Medición ambiental observada</b><span class="oa-badge">OpenAQ · ${escHtml(freshnessLabel(data.freshness))}</span></div>
      <div class="oa-station"><strong>${escHtml(s.name||'Estación OpenAQ')}</strong>${s.distance_km!=null?`${fmt(s.distance_km)} km del punto · `:''}${escHtml(s.locality||s.country||'')}${s.provider?` · ${escHtml(s.provider)}`:''}<br>${escHtml(ageLabel(data.age_hours))}</div>
      <div class="oa-grid">${rows.map(m=>`<span><strong>${fmt(m.value)} ${escHtml(m.units||'')}</strong><small>${escHtml(m.display_name||m.parameter||'Parámetro')}</small></span>`).join('')}</div>
      <p class="oa-note">Medición ambiental de una estación/sensor disponible. No equivale a una medición de higiene ocupacional dentro del puesto de trabajo.</p>`;
  }
  async function hydratePopup(){
    const x=itemForPopup(); if(!x)return;
    const env=document.querySelector('.leaflet-popup .popup-environment'); if(!env)return;
    let root=document.querySelector('.leaflet-popup .openaq-observed');
    if(!root){root=document.createElement('section');root.className='openaq-observed';root.innerHTML='<div><b>📍 Medición ambiental observada</b><span class="oa-badge">OpenAQ</span></div><p class="oa-note">Buscando estación cercana…</p>';env.insertAdjacentElement('afterend',root)}
    const data=await fetchObserved(x); if(!document.body.contains(root))return;
    if(data)renderObserved(root,data);else root.remove();
  }

  installStyles();
  if(typeof map!=='undefined'&&map?.on)map.on('popupopen',()=>setTimeout(hydratePopup,20));
})();
