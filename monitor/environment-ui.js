/* Capa visual de exposición ambiental SST. Se carga después de app.js. */
(() => {
  const originalImpactDetail = renderImpactDetail;
  const originalSstReading = sstReading;

  function num(v){
    const x=Number(v);
    return Number.isFinite(x)?x:null;
  }
  function fmt(v,d=0){return v===null?'—':v.toFixed(d)}
  function uvClass(v){
    if(v===null)return'na';
    if(v>=11)return'extreme';
    if(v>=8)return'very-high';
    if(v>=6)return'high';
    if(v>=3)return'moderate';
    return'low';
  }
  function uvLabel(v){
    if(v===null)return'Sin dato';
    if(v>=11)return'Extremo';
    if(v>=8)return'Muy alto';
    if(v>=6)return'Alto';
    if(v>=3)return'Moderado';
    return'Bajo';
  }

  function metricsOf(x){return x?.raw?.metrics||null}

  function environmentalReading(x){
    const m=metricsOf(x);
    if(!m)return originalSstReading(x);
    const uv=num(m.uv_index), apparent=num(m.apparent_temperature_c), aqi=num(m.us_aqi);
    const pm25=num(m.pm2_5), gust=num(m.wind_gust_kmh), rain=num(m.precipitation_mm);
    const notes=[];
    if(uv!==null&&uv>=8)notes.push(`UV ${fmt(uv,1)} ${uvLabel(uv).toLowerCase()}: reducir exposición solar directa y reforzar sombra, ropa de cobertura y protección ocular/cutánea.`);
    else if(uv!==null&&uv>=3)notes.push(`UV ${fmt(uv,1)} ${uvLabel(uv).toLowerCase()}: planificar protección solar para tareas exteriores.`);
    if(apparent!==null&&apparent>=38)notes.push(`Sensación térmica ${fmt(apparent,1)} °C: revisar pausas, hidratación, sombra y carga de trabajo; confirmar estrés térmico con el método ocupacional aplicable.`);
    if((aqi!==null&&aqi>=101)||(pm25!==null&&pm25>=35.5))notes.push('Calidad del aire desfavorable: revisar exposición respiratoria, personal sensible y tareas al aire libre.');
    if(gust!==null&&gust>=65)notes.push(`Ráfagas de ${fmt(gust)} km/h: revisar trabajos en altura, objetos sueltos, izaje y actividades exteriores.`);
    if(rain!==null&&rain>=10)notes.push(`Precipitación ${fmt(rain,1)} mm: revisar drenajes, accesos, superficies resbaladizas y movilidad.`);
    return notes.length?notes.slice(0,2).join(' '):'Condiciones ambientales sin señal prioritaria automática. Mantener vigilancia según la tarea, exposición real y condiciones locales.';
  }

  sstReading = function(x){
    return activeFeed==='air'?environmentalReading(x):originalSstReading(x);
  };

  renderImpactDetail = function(x){
    originalImpactDetail(x);
    if(activeFeed!=='air'||!x)return;
    const m=metricsOf(x);
    if(!m)return;
    const root=document.querySelector('#impactDetail');
    if(!root)return;
    const uv=num(m.uv_index);
    const block=document.createElement('section');
    block.className='environment-metrics';
    block.innerHTML=`
      <div class="environment-metrics-head">
        <div><span>EXPOSICIÓN AMBIENTAL</span><b>Condiciones actuales</b></div>
        <div class="uv-badge ${uvClass(uv)}"><small>Índice UV</small><strong>${fmt(uv,1)}</strong><span>${uvLabel(uv)}</span></div>
      </div>
      <div class="environment-grid">
        <article><span>🌡️</span><div><b>${fmt(num(m.temperature_c),1)} °C</b><small>Temperatura</small></div></article>
        <article><span>☀️</span><div><b>${fmt(num(m.apparent_temperature_c),1)} °C</b><small>Sensación térmica</small></div></article>
        <article><span>💧</span><div><b>${fmt(num(m.relative_humidity_pct))}%</b><small>Humedad</small></div></article>
        <article><span>🌫️</span><div><b>${fmt(num(m.us_aqi))}</b><small>AQI US</small></div></article>
        <article><span>🫁</span><div><b>${fmt(num(m.pm2_5),1)}</b><small>PM2.5 µg/m³</small></div></article>
        <article><span>◌</span><div><b>${fmt(num(m.pm10),1)}</b><small>PM10 µg/m³</small></div></article>
        <article><span>O₃</span><div><b>${fmt(num(m.ozone),1)}</b><small>Ozono µg/m³</small></div></article>
        <article><span>🏜️</span><div><b>${fmt(num(m.dust),1)}</b><small>Polvo µg/m³</small></div></article>
        <article><span>💨</span><div><b>${fmt(num(m.wind_speed_kmh))}</b><small>Viento km/h</small></div></article>
        <article><span>↯</span><div><b>${fmt(num(m.wind_gust_kmh))}</b><small>Ráfagas km/h</small></div></article>
        <article><span>🌧️</span><div><b>${fmt(num(m.precipitation_mm),1)} mm</b><small>Precipitación</small></div></article>
      </div>
      <p class="environment-caveat">La sensación térmica y esta priorización son apoyo situacional. No sustituyen mediciones ocupacionales específicas como WBGT, evaluación higiénica ni criterios legales aplicables.</p>`;
    const actions=root.querySelector('.impact-actions');
    if(actions)root.insertBefore(block,actions);else root.appendChild(block);
  };

  function installImpactCounterExplanation(){
    const subtitle=document.querySelector('.impact-subtitle');
    if(!subtitle||document.querySelector('.impact-counter-note'))return;
    const note=document.createElement('div');
    note.className='impact-counter-note';
    note.innerHTML='<b>¿Qué significan estos números?</b><p>Cuentan <strong>señales activas asociadas a cada ámbito</strong> según la capa, cobertura y filtros seleccionados. Por ejemplo, “17 señales · Trabajadores” significa 17 señales que justifican verificar una posible exposición de trabajadores; <strong>no significa 17 trabajadores afectados</strong>.</p>';
    subtitle.insertAdjacentElement('afterend',note);
  }

  function clarifyImpactDomains(){
    const wrap=document.querySelector('#impactDomains');
    if(!wrap)return;
    wrap.querySelectorAll('article').forEach(card=>{
      if(card.dataset.semanticReady==='1')return;
      const value=card.querySelector('b');
      const labelEl=card.querySelector('small');
      if(!value||!labelEl)return;
      const count=parseInt(value.textContent,10);
      const label=labelEl.textContent.trim();
      if(!Number.isFinite(count))return;
      value.innerHTML=`${count}<em> señales</em>`;
      labelEl.textContent=label;
      card.title=`${count} señales activas asociadas al ámbito ${label}. No representa un conteo de personas, instalaciones o activos realmente afectados.`;
      card.setAttribute('aria-label',`${label}: ${count} señales activas asociadas. No es un conteo de personas o activos afectados.`);
      card.dataset.semanticReady='1';
    });
  }

  function installSourcesSection(){
    if(document.querySelector('#dataSources'))return;
    const anchor=document.querySelector('.disclaimer-card');
    if(!anchor)return;
    const section=document.createElement('section');
    section.className='sources-card';
    section.id='dataSources';
    section.innerHTML=`
      <div class="sources-head">
        <div>
          <p class="eyebrow">TRAZABILIDAD DEL DATO</p>
          <h3>¿De dónde sale la información?</h3>
          <p>El monitor no inventa eventos ni “cuenta afectados”. Consulta fuentes externas, normaliza las señales y luego aplica una lectura preventiva SST para ayudar a decidir qué verificar primero.</p>
        </div>
        <span class="sources-badge">Datos abiertos + APIs</span>
      </div>

      <div class="data-method">
        <article><span>1</span><div><b>Fuente</b><p>Se recibe un evento, observación o condición desde el proveedor indicado.</p></div></article>
        <article><span>2</span><div><b>Contexto</b><p>Se revisan ubicación, severidad, tipo de señal y proximidad a Venezuela.</p></div></article>
        <article><span>3</span><div><b>Lectura SST</b><p>Se identifican ámbitos que conviene verificar: trabajadores, sedes, movilidad, servicios, comunicaciones y continuidad.</p></div></article>
      </div>

      <div class="sources-grid">
        <a href="https://eonet.gsfc.nasa.gov/docs/v3" target="_blank" rel="noopener" class="source-card">
          <span class="source-icon">🛰️</span><div><b>NASA EONET</b><small>Eventos naturales</small><p>Metadatos de eventos abiertos como incendios, tormentas severas, volcanes e inundaciones, con ubicación y fuentes asociadas.</p></div>
        </a>
        <a href="https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php" target="_blank" rel="noopener" class="source-card">
          <span class="source-icon">🌎</span><div><b>USGS</b><small>Sismos</small><p>Feed GeoJSON de terremotos. El monitor usa el feed M4.5+ del último día como señal sísmica de referencia.</p></div>
        </a>
        <a href="https://api.ioda.inetintel.cc.gatech.edu/v2/" target="_blank" rel="noopener" class="source-card">
          <span class="source-icon">🌐</span><div><b>IODA · Georgia Tech</b><small>Conectividad</small><p>Eventos y alertas de interrupciones de Internet construidos a partir de señales de conectividad y enrutamiento.</p></div>
        </a>
        <a href="https://simplemap.safecast.org/docs/index.html" target="_blank" rel="noopener" class="source-card">
          <span class="source-icon">☢️</span><div><b>Safecast</b><small>Radiación ionizante</small><p>Red abierta de mediciones y sensores de radiación. Una observación no equivale por sí sola a exposición ocupacional confirmada.</p></div>
        </a>
        <a href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" rel="noopener" class="source-card">
          <span class="source-icon">☀️</span><div><b>Open-Meteo / CAMS</b><small>Exposición ambiental</small><p>UV, AQI, PM2.5, PM10, ozono, polvo y variables meteorológicas. Son datos/modelos ambientales, no mediciones higiénicas dentro del puesto de trabajo.</p></div>
        </a>
        <a href="https://worldmonitor.app/" target="_blank" rel="noopener" class="source-card optional">
          <span class="source-icon">📡</span><div><b>World Monitor</b><small>Enriquecimiento opcional</small><p>Cuando está disponible puede enriquecer determinadas capas. El sistema mantiene fuentes públicas directas como respaldo independiente.</p></div>
        </a>
      </div>

      <div class="sources-clarification">
        <b>Importante sobre “Impacto Venezuela”</b>
        <p>Los valores mostrados son una <strong>priorización automática de señales</strong>. No representan cantidad de trabajadores afectados, lesionados, daños materiales ni pérdidas económicas. Para confirmar impacto real deben verificarse exposición, vulnerabilidad, controles existentes y fuentes oficiales competentes.</p>
      </div>`;
    anchor.parentNode.insertBefore(section,anchor);
  }

  const environmentTab=document.querySelector('.feed-tab[data-feed="air"]');
  if(environmentTab){
    const title=environmentTab.querySelector('b');
    const small=environmentTab.querySelector('small');
    if(title)title.textContent='Exposición';
    if(small)small.textContent='UV, aire, calor, viento y lluvia';
  }
  if(feedMeta?.air){
    feedMeta.air.title='Exposición ambiental';
    feedMeta.air.action='Revisar radiación UV solar, calidad del aire, carga térmica orientativa, lluvia y viento según exposición real de los trabajadores.';
  }

  installImpactCounterExplanation();
  installSourcesSection();
  clarifyImpactDomains();

  const impactDomainsRoot=document.querySelector('#impactDomains');
  if(impactDomainsRoot){
    const observer=new MutationObserver(()=>clarifyImpactDomains());
    observer.observe(impactDomainsRoot,{childList:true,subtree:true});
  }
})();