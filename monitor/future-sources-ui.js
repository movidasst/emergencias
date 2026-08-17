/* Activación progresiva de fuentes que dependen del backend integrado. */
(() => {
  const API='https://lfdmbkzghnwvsapxypvt.supabase.co/functions/v1/world-monitor-sst';

  function setBadge(id,text,cls='active'){
    const el=document.querySelector(`[data-source-id="${id}"] .source-status`);
    if(!el)return;
    el.textContent=text;
    el.className=`source-status ${cls}`;
  }

  async function getHealth(){
    try{
      const r=await fetch(`${API}?feed=health`,{headers:{Accept:'application/json'}});
      return r.ok?await r.json():null;
    }catch{return null}
  }

  async function probe(feed,extra=''){
    try{
      const r=await fetch(`${API}?feed=${encodeURIComponent(feed)}${extra}`,{headers:{Accept:'application/json'}});
      return r.ok?await r.json():null;
    }catch{return null}
  }

  async function enableSpaceWeather(){
    if(document.querySelector('.feed-tab[data-feed="space"]'))return;
    const p=await probe('space');
    if(!p)return;
    feedMeta.space={
      title:'Clima espacial',
      action:'Revisar continuidad de GPS, comunicaciones HF, navegación, sincronización y servicios dependientes de infraestructura espacial.'
    };
    const nav=document.querySelector('.feed-tabs');
    if(!nav)return;
    const btn=document.createElement('button');
    btn.className='feed-tab space-weather-tab';
    btn.dataset.feed='space';
    btn.type='button';
    btn.innerHTML='<span>🛰️</span><b>Clima espacial</b><small>GPS, radio y continuidad</small>';
    btn.addEventListener('click',async()=>{
      document.querySelectorAll('.feed-tab').forEach(b=>b.classList.toggle('active',b===btn));
      await loadFeed('space');
    });
    nav.appendChild(btn);
    setBadge('swpc','Activo · NOAA SWPC','active');
  }

  async function init(){
    const h=await getHealth();
    if(!h)return;

    if(h.openaq_api_key_configured){
      const test=await probe('openaq','&lat=10.4806&lon=-66.9036');
      setBadge('openaq',test?'Activo · medición observada':'Clave configurada · pendiente endpoint',test?'active':'ready');
    }

    if(h.hdx_hapi_app_identifier_configured){
      const test=await probe('hdx','&location_code=VEN');
      setBadge('hdx',test?'Activo · contexto territorial':'Identificador configurado · pendiente endpoint',test?'active':'ready');
    }

    const sources=(h.natural_sources||[]).join(' ');
    if(/GDACS/i.test(sources))setBadge('gdacs','Activo · feed GDACS','active');
    if(/NHC/i.test(sources))setBadge('nhc','Activo · NOAA/NHC','active');
    if(/Tsunami/i.test(sources))setBadge('tsunami','Activo · NOAA CAP','active');

    await enableSpaceWeather();
  }

  init();
})();
