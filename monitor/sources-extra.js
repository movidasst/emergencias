/* Fuentes adicionales y carga de inteligencia SST contextual. */
(() => {
  const API='https://lfdmbkzghnwvsapxypvt.supabase.co/functions/v1/world-monitor-sst';

  function installSourceStyles(){
    if(document.querySelector('#source-status-styles'))return;
    const style=document.createElement('style');
    style.id='source-status-styles';
    style.textContent=`
      .source-status{display:inline-flex;align-items:center;gap:4px;margin-top:6px;padding:4px 7px;border-radius:999px;font-size:7.5px;font-weight:800;letter-spacing:.02em;background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0}
      .source-status.active{background:#eef8ec;color:#477c31;border-color:#cfe4c8}.source-status.ready{background:#edf8f8;color:#007b85;border-color:#cbe5e7}.source-status.key{background:#fff8e8;color:#7a5b14;border-color:#eedca9}.source-status.error{background:#fff1f0;color:#9a3c35;border-color:#efcbc7}
      .source-card.firms{background:linear-gradient(145deg,#fff,#fff9f0);border-color:#f0dfbd}.source-card.firms .source-icon{background:#fff1da}
      .source-card.openaq{background:linear-gradient(145deg,#fff,#f7fcff);border-color:#d8e8ef}.source-card.openaq .source-icon{background:#eaf6fb}
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
    addSourceCard({id:'firms',icon:'🔥',name:'NASA FIRMS',subtitle:'Fuego activo y anomalías térmicas',text:'Detecciones satelitales VIIRS NOAA-20, NOAA-21 y Suomi-NPP. La aplicación interpreta FRP, confianza, ubicación y contexto SST sin asumir daño confirmado.',url:'https://firms.modaps.eosdis.nasa.gov/',status:'Verificando conexión…',statusClass:'ready',className:'firms'});
    addSourceCard({id:'gdacs',icon:'🚨',name:'GDACS',subtitle:'Alertas globales de desastres',text:'ONU + Comisión Europea. Alertas y contexto de terremotos, ciclones, inundaciones y otros eventos internacionales.',url:'https://www.gdacs.org/',status:'Fuente pública · próxima integración'});
    addSourceCard({id:'nhc',icon:'🌀',name:'NOAA / NHC',subtitle:'Ciclones tropicales',text:'Trayectorias, avisos y productos oficiales para ciclones del Atlántico y Caribe relevantes para Venezuela.',url:'https://www.nhc.noaa.gov/',status:'Fuente pública · próxima integración'});
    addSourceCard({id:'glofas',icon:'🌊',name:'Copernicus GloFAS / GFM',subtitle:'Inundaciones',text:'Pronóstico y monitoreo global de inundaciones para complementar eventos con contexto hidrológico y territorial.',url:'https://global-flood.emergency.copernicus.eu/',status:'Fuente pública · próxima integración'});
    addSourceCard({id:'tsunami',icon:'🌊',name:'NOAA Tsunami',subtitle:'Tsunami',text:'Mensajes y avisos estructurados para vigilancia de amenazas de tsunami, incluido el Caribe.',url:'https://www.tsunami.gov/',status:'Fuente pública · próxima integración'});
    addSourceCard({id:'swpc',icon:'🛰️',name:'NOAA SWPC',subtitle:'Clima espacial',text:'Alertas geomagnéticas y solares como contexto para GPS, comunicaciones y continuidad tecnológica.',url:'https://www.swpc.noaa.gov/',status:'Fuente pública · próxima integración'});
    addSourceCard({id:'openaq',icon:'🌫️',name:'OpenAQ',subtitle:'Calidad del aire medida',text:'Última medición ambiental disponible de estaciones/sensores cercanos para contrastar, cuando exista cobertura, el contexto modelado de Open-Meteo/CAMS. No es una medición ocupacional.',url:'https://openaq.org/',status:'Verificando API key…',statusClass:'ready',className:'openaq'});
    addSourceCard({id:'osm',icon:'🗺️',name:'OpenStreetMap / Overpass',subtitle:'Infraestructura expuesta',text:'Hospitales, bomberos, carreteras, instalaciones y otros elementos territoriales para cruzar con amenazas.',url:'https://www.openstreetmap.org/',status:'Disponible · usado en el ecosistema',statusClass:'active'});
    addSourceCard({id:'reliefweb',icon:'🆘',name:'OCHA ReliefWeb',subtitle:'Contexto humanitario',text:'Informes y actualizaciones curadas sobre emergencias y desastres para enriquecer la lectura situacional.',url:'https://reliefweb.int/',status:'Pendiente aprobación de appname',statusClass:'key'});
    addSourceCard({id:'hdx',icon:'🌍',name:'OCHA HDX HAPI',subtitle:'Contexto territorial',text:'Población de referencia e indicadores territoriales para contextualizar exposición. No representa personas afectadas por una señal.',url:'https://data.humdata.org/hapi',status:'Verificando app identifier…',statusClass:'ready'});
  }

  function setBadge(id,text,className){
    const badge=document.querySelector(`[data-source-id="${id}"] .source-status`);
    if(!badge)return;
    badge.textContent=text;
    badge.className=`source-status ${className}`;
  }

  async function updateSourceStatus(){
    try{
      const r=await fetch(`${API}?feed=health`,{headers:{Accept:'application/json'}});
      const p=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error('health');

      if(p.nasa_firms_map_key_configured) setBadge('firms','Activo · VIIRS NOAA-20/21/Suomi-NPP','active');
      else setBadge('firms','Revisar MAP KEY / despliegue','key');

      if(p.openaq_api_key_configured) setBadge('openaq','Clave configurada · medición observada','active');
      else setBadge('openaq','Clave guardada · pendiente despliegue backend','ready');

      if(p.hdx_hapi_app_identifier_configured) setBadge('hdx','Identificador configurado · verificando datos','ready');
    }catch{
      setBadge('firms','Estado temporalmente no disponible','error');
      setBadge('openaq','Estado temporalmente no disponible','error');
    }
  }

  function loadScript(src){
    if(document.querySelector(`script[src="${src}"]`))return;
    const script=document.createElement('script'); script.src=src; script.defer=false; document.body.appendChild(script);
  }
  function loadIntelligenceLayers(){
    if(!document.querySelector('link[href="./sst-intelligence.css"]')){
      const link=document.createElement('link'); link.rel='stylesheet'; link.href='./sst-intelligence.css'; document.head.appendChild(link);
    }
    loadScript('./sst-intelligence.js');
    loadScript('./openaq-ui.js');
    loadScript('./future-sources-ui.js');
  }

  installSourceStyles();
  installAdditionalSources();
  updateSourceStatus();
  loadIntelligenceLayers();
})();
