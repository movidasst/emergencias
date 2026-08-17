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
})();