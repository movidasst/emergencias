/* Integraciones adicionales de fuentes públicas. Se carga después de app.js y environment-ui.js. */
(() => {
  const FIRMS_API='https://lfdmbkzghnwvsapxypvt.supabase.co/functions/v1/nasa-firms-sst';
  const originalLoadFeed=loadFeed;

  function installSourceStyles(){
    if(document.querySelector('#source-status-styles'))return;
    const style=document.createElement('style');
    style.id='source-status-styles';
    style.textContent=`
      .source-status{display:inline-flex;align-items:center;gap:4px;margin-top:6px;padding:4px 7px;border-radius:999px;font-size:7.5px;font-weight:800;letter-spacing:.02em;background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0}
      .source-status.active{background:#eef8ec;color:#477c31;border-color:#cfe4c8}.source-status.ready{background:#edf8f8;color:#007b85;border-color:#cbe5e7}.source-status.key{background:#fff8e8;color:#7a5b14;border-color:#eedca9}.source-status.error{background:#fff1f0;color:#9a3c35;border-color:#efcbc7}
      .source-card.firms{background:linear-gradient(145deg,#fff,#fff9f0);border-color:#f0dfbd}.source-card.firms .source-icon{background:#fff1da}
    `;
    document.head.appendChild(style);
  }

  function addSourceCard({id,icon,name,subtitle,text,url,status,statusClass='ready',className=''}){
    const grid=document.querySelector('.sources-grid');
    if(!grid||grid.querySelector(`[data-source-id="${id}"]`))return;
    const card=document.createElement('a');
    card.href=url; card.target='_blank'; card.rel='noopener';
    card.className=`source-card ${className}`.trim();
    card.dataset.sourceId=id;
    card.innerHTML=`<span class="source-icon">${icon}</span><div><b>${name}</b><small>${subtitle}</small><p>${text}</p><span class="source-status ${statusClass}">${status}</span></div>`;
    const eonet=grid.querySelector('[href*="eonet.gsfc.nasa.gov"]');
    if(id==='firms'&&eonet)eonet.insertAdjacentElement('afterend',card);else grid.appendChild(card);
  }

  function installAdditionalSources(){
    addSourceCard({id:'firms',icon:'🔥',name:'NASA FIRMS',subtitle:'Fuego activo y anomalías térmicas',text:'Detecciones satelitales VIIRS NOAA-20 y NOAA-21 sobre Venezuela. Una detección térmica requiere contextualización antes de asumir impacto ocupacional.',url:'https://firms.modaps.eosdis.nasa.gov/',status:'Verificando conexión…',statusClass:'ready',className:'firms'});
    addSourceCard({id:'gdacs',icon:'🚨',name:'GDACS',subtitle:'Alertas globales de desastres',text:'ONU + Comisión Europea. Aporta alertas y contexto para terremotos, ciclones, inundaciones y otros eventos de interés internacional.',url:'https://www.gdacs.org/',status:'Fuente pública · integración siguiente'});
    addSourceCard({id:'nhc',icon:'🌀',name:'NOAA / NHC',subtitle:'Ciclones tropicales',text:'Trayectorias, avisos y productos oficiales para ciclones del Atlántico y Caribe, relevantes para vigilancia regional de Venezuela.',url:'https://www.nhc.noaa.gov/',status:'Fuente pública · integración siguiente'});
    addSourceCard({id:'glofas',icon:'🌊',name:'Copernicus GloFAS / GFM',subtitle:'Inundaciones',text:'Pronóstico y monitoreo global de inundaciones para complementar eventos reportados con contexto hidrológico y territorial.',url:'https://global-flood.emergency.copernicus.eu/',status:'Fuente pública · integración siguiente'});
    addSourceCard({id:'tsunami',icon:'🌊',name:'NOAA Tsunami',subtitle:'Tsunami',text:'Mensajes y avisos estructurados para vigilancia de amenazas de tsunami, incluido el Caribe.',url:'https://www.tsunami.gov/',status:'Fuente pública · integración siguiente'});
    addSourceCard({id:'swpc',icon:'🛰️',name:'NOAA SWPC',subtitle:'Clima espacial',text:'Alertas geomagnéticas y solares útiles como contexto para GPS, comunicaciones y continuidad tecnológica.',url:'https://www.swpc.noaa.gov/',status:'Fuente pública · integración siguiente'});
    addSourceCard({id:'openaq',icon:'🌫️',name:'OpenAQ',subtitle:'Calidad del aire medida',text:'Mediciones de estaciones y sensores para contrastar, cuando exista cobertura, los modelos ambientales de Open-Meteo/CAMS.',url:'https://openaq.org/',status:'Requiere API key gratuita',statusClass:'key'});
    addSourceCard({id:'osm',icon:'🗺️',name:'OpenStreetMap / Overpass',subtitle:'Infraestructura expuesta',text:'Hospitales, bomberos, centros de salud, carreteras y otros elementos territoriales que pueden cruzarse con una señal de amenaza.',url:'https://www.openstreetmap.org/',status:'Disponible · ya usado en el ecosistema',statusClass:'active'});
    addSourceCard({id:'reliefweb',icon:'🆘',name:'OCHA ReliefWeb',subtitle:'Contexto humanitario',text:'Informes y actualizaciones curadas sobre emergencias y desastres para complementar la lectura situacional.',url:'https://reliefweb.int/',status:'Requiere appname aprobado',statusClass:'key'});
    addSourceCard({id:'hdx',icon:'🌍',name:'OCHA HDX HAPI',subtitle:'Indicadores humanitarios',text:'Datos estandarizados de población, infraestructura y otros indicadores para enriquecer la exposición territorial.',url:'https://data.humdata.org/hapi',status:'Requiere app identifier gratuito',statusClass:'key'});
  }

  async function updateFirmsStatus(){
    const badge=document.querySelector('[data-source-id="firms"] .source-status');
    if(!badge)return;
    try{
      const r=await fetch(`${FIRMS_API}?health=1`,{headers:{Accept:'application/json'}});
      const p=await r.json().catch(()=>({}));
      if(r.ok&&p.configured){badge.textContent='Activo · VIIRS NOAA-20/21';badge.className='source-status active'}
      else {badge.textContent='MAP KEY no configurada';badge.className='source-status key'}
    }catch{badge.textContent='Estado no disponible';badge.className='source-status error'}
  }

  async function enrichNaturalWithFirms(){
    if(activeFeed!=='natural')return;
    try{
      const r=await fetch(FIRMS_API,{headers:{Accept:'application/json'}});
      const p=await r.json().catch(()=>({}));
      if(!r.ok||!Array.isArray(p.data))return;
      const firms=p.data.map((item,i)=>normalize(item,`firms-${i}`));
      const byId=new Map(rawItems.map(x=>[x.id,x]));
      firms.forEach(x=>byId.set(x.id,x));
      rawItems=[...byId.values()];
      render();
    }catch(e){console.warn('NASA FIRMS no disponible; se mantienen las demás fuentes naturales.',e)}
  }

  loadFeed=async function(feed=activeFeed){
    await originalLoadFeed(feed);
    if(activeFeed==='natural')await enrichNaturalWithFirms();
  };

  installSourceStyles();
  installAdditionalSources();
  updateFirmsStatus();
  setTimeout(()=>loadFeed(activeFeed),0);
})();
