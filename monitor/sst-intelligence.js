/* Inteligencia SST contextual para señales del monitor. Se carga al final. */
(() => {
  const baseRender = render;
  const baseImpactDetail = renderImpactDetail;
  const baseSstReading = sstReading;
  const envCache = new Map();

  function isFirms(x){
    return /NASA FIRMS/i.test(x?.source || '') || x?.raw?.metrics?.frp_mw != null || /anomal[ií]a t[eé]rmica|foco t[eé]rmico/i.test(x?.title || '');
  }
  function num(v){const z=Number(v);return Number.isFinite(z)?z:null}
  function f(v,d=1){const z=num(v);return z===null?'—':z.toFixed(d)}
  function cardinal(deg){
    const dirs=['N','NE','E','SE','S','SO','O','NO'];
    const n=num(deg); return n===null?'—':dirs[Math.round((((n%360)+360)%360)/45)%8];
  }
  function bearing(lat1,lon1,lat2,lon2){
    const r=v=>v*Math.PI/180;
    const y=Math.sin(r(lon2-lon1))*Math.cos(r(lat2));
    const x=Math.cos(r(lat1))*Math.sin(r(lat2))-Math.sin(r(lat1))*Math.cos(r(lat2))*Math.cos(r(lon2-lon1));
    return (Math.atan2(y,x)*180/Math.PI+360)%360;
  }
  function nearestReference(x){
    if(x?.lat==null || x?.lon==null || !Array.isArray(VENEZUELA_REFERENCE_POINTS)) return null;
    let best=null;
    for(const [name,lat,lon] of VENEZUELA_REFERENCE_POINTS){
      const km=haversine(lat,lon,x.lat,x.lon);
      if(!best || km<best.km) best={name,lat,lon,km};
    }
    if(!best) return null;
    return {...best,dir:cardinal(bearing(best.lat,best.lon,x.lat,x.lon))};
  }
  function locationText(x){
    const near=nearestReference(x);
    if(near && near.km<8) return `Área de ${near.name}`;
    if(near) return `≈ ${Math.round(near.km)} km al ${near.dir} de ${near.name}`;
    if(x?.lat!=null && x?.lon!=null) return `${Number(x.lat).toFixed(3)}, ${Number(x.lon).toFixed(3)}`;
    return x?.country || 'Ubicación no determinada';
  }
  function fireMetrics(x){
    const m=x?.raw?.metrics || {};
    return {
      frp:num(m.frp_mw ?? x?.raw?.frp),
      confidence:String(m.confidence ?? x?.raw?.confidence ?? '').trim(),
      satellite:String(m.satellite ?? x?.raw?.satellite ?? '').trim(),
      instrument:String(m.instrument ?? x?.raw?.instrument ?? 'VIIRS').trim(),
      daynight:String(m.daynight ?? '').trim()
    };
  }
  function fireActions(){
    return [
      'Confirmar si existen trabajadores en campo, tareas exteriores o sedes próximas al punto.',
      'Revisar humo, visibilidad y calidad del aire antes de mantener tareas al aire libre.',
      'Verificar materiales combustibles, almacenamiento inflamable, vegetación y fuentes de ignición en instalaciones cercanas.',
      'Comprobar accesos, rutas alternativas y evolución de nuevas detecciones antes de escalar la respuesta.'
    ];
  }
  function safeId(id){return String(id||'x').replace(/[^a-zA-Z0-9_-]/g,'_')}

  function popupHtml(x){
    const impact=impactModel(x);
    const firms=isFirms(x);
    const m=fireMetrics(x);
    const displayTitle=firms?'Anomalía térmica detectada por satélite':x.title;
    const actions=firms?fireActions():impact.actions.slice(0,3);
    const metricRow=firms?`
      <div class="popup-metrics">
        ${m.frp!==null?`<span><b>${f(m.frp)} MW</b><small>FRP</small></span>`:''}
        ${m.confidence?`<span><b>${esc(m.confidence)}</b><small>Confianza</small></span>`:''}
        ${m.satellite?`<span><b>${esc(m.satellite)}</b><small>Satélite</small></span>`:''}
      </div>`:'';
    const meaning=firms
      ? `El satélite detectó una anomalía térmica compatible con fuego activo. ${m.frp!==null?`FRP ${f(m.frp)} MW expresa energía radiativa estimada y sirve para comparar intensidad/evolución; no es el tamaño del incendio ni un nivel de exposición ocupacional.`:'La detección requiere contexto antes de asumir un incendio o afectación.'}`
      : impact.summary;
    const envId=`sst-env-${safeId(x.id)}`;
    return `
      <div class="popup-card sst-popup ${firms?'firms-popup':''}">
        <div class="popup-kicker"><span>${esc(severityLabel(x.severity))}</span>${firms?'<em>NASA FIRMS · VIIRS</em>':''}</div>
        <strong class="popup-title">${esc(displayTitle)}</strong>
        <div class="popup-facts">
          <p><b>📍 Dónde</b><span>${esc(locationText(x))}</span></p>
          ${x.time?`<p><b>🕒 Detectado</b><span>${esc(x.time)}</span></p>`:''}
        </div>
        ${metricRow}
        <section class="popup-meaning"><b>¿Qué significa?</b><p>${esc(meaning)}</p></section>
        <section class="popup-impact ${impact.level}"><b>${esc(impactLabel(impact.level))}</b><p>${esc(firms?'Prioridad para verificar exposición real de trabajadores, instalaciones, rutas y continuidad; no confirma daño ni personas afectadas.':impact.summary)}</p></section>
        ${firms?`<section class="popup-environment" id="${envId}"><b>🌬️ Contexto ambiental actual</b><p>Consultando viento y calidad del aire del punto…</p></section>`:''}
        <section class="popup-check"><b>Qué verificar ahora</b><ul>${actions.map(a=>`<li>${esc(a)}</li>`).join('')}</ul></section>
        ${firms?'<p class="popup-caveat"><b>Ojo:</b> una detección FIRMS no confirma por sí sola incendio estructural, afectación a una empresa ni exposición de trabajadores.</p>':''}
        ${x.url?`<a class="popup-source" href="${esc(x.url)}" target="_blank" rel="noopener">Abrir fuente original ↗</a>`:''}
      </div>`;
  }

  async function getEnvironment(x){
    if(x?.lat==null || x?.lon==null) return null;
    const key=`${Number(x.lat).toFixed(3)},${Number(x.lon).toFixed(3)}`;
    if(envCache.has(key)) return envCache.get(key);
    const wx=`https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(x.lat)}&longitude=${encodeURIComponent(x.lon)}&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation&timezone=auto`;
    const aq=`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${encodeURIComponent(x.lat)}&longitude=${encodeURIComponent(x.lon)}&current=pm2_5,pm10,us_aqi&timezone=auto`;
    try{
      const [wr,ar]=await Promise.all([fetch(wx),fetch(aq)]);
      const [w,a]=await Promise.all([wr.ok?wr.json():{},ar.ok?ar.json():{}]);
      const out={
        wind:num(w?.current?.wind_speed_10m),dir:num(w?.current?.wind_direction_10m),gust:num(w?.current?.wind_gusts_10m),rain:num(w?.current?.precipitation),
        pm25:num(a?.current?.pm2_5),pm10:num(a?.current?.pm10),aqi:num(a?.current?.us_aqi)
      };
      envCache.set(key,out); return out;
    }catch{return null}
  }
  function environmentAdvice(e){
    const notes=[];
    if(e?.pm25!==null && e?.pm25>=35.5) notes.push('PM2.5 elevado: priorizar verificación de exposición respiratoria.');
    if(e?.gust!==null && e?.gust>=50) notes.push('Ráfagas relevantes: revisar propagación, trabajos exteriores y objetos sueltos.');
    if(e?.rain!==null && e?.rain>0) notes.push('Hay precipitación reportada en el punto.');
    return notes[0]||'Usar estos datos como contexto ambiental; no sustituyen mediciones ocupacionales ni observación local.';
  }
  async function hydrateEnvironment(x){
    const root=document.getElementById(`sst-env-${safeId(x.id)}`);
    if(!root) return;
    const e=await getEnvironment(x);
    if(!document.body.contains(root)) return;
    if(!e){root.innerHTML='<b>🌬️ Contexto ambiental actual</b><p>No disponible en este momento.</p>';return;}
    root.innerHTML=`
      <b>🌬️ Contexto ambiental actual</b>
      <div class="popup-env-grid">
        <span><strong>${f(e.wind,0)} km/h</strong><small>Viento${e.dir!==null?` desde ${cardinal(e.dir)}`:''}</small></span>
        <span><strong>${f(e.gust,0)} km/h</strong><small>Ráfagas</small></span>
        <span><strong>${f(e.pm25)} µg/m³</strong><small>PM2.5</small></span>
        <span><strong>${f(e.aqi,0)}</strong><small>AQI US</small></span>
      </div>
      <p>${esc(environmentAdvice(e))}</p>`;
  }

  function enhanceFirmsCards(items){
    for(const x of items){
      if(!isFirms(x)) continue;
      const card=document.querySelector(`.event-card[data-id="${CSS.escape(String(x.id))}"]`);
      if(!card) continue;
      const h=card.querySelector('h4');
      if(h) h.textContent='Anomalía térmica detectada por satélite';
      if(card.querySelector('.fire-card-context')) continue;
      const m=fireMetrics(x);
      const meta=card.querySelector('.event-meta');
      const block=document.createElement('div');
      block.className='fire-card-context';
      block.innerHTML=`<span>📍 ${esc(locationText(x))}</span>${m.frp!==null?`<span><b>FRP ${f(m.frp)} MW</b> · intensidad radiativa estimada</span>`:''}${m.confidence?`<span>Confianza ${esc(m.confidence)}</span>`:''}`;
      meta?.insertAdjacentElement('afterend',block);
    }
  }

  function rebindMarkerPopups(items){
    for(const entry of markers){
      const x=items.find(i=>i.id===entry.id);
      if(!x) continue;
      entry.marker.bindPopup(popupHtml(x),{maxWidth:380,minWidth:290});
      if(!entry.marker._sstIntelBound){
        entry.marker.on('popupopen',()=>{
          const current=rawItems.find(i=>i.id===entry.id);
          if(current && isFirms(current)) hydrateEnvironment(current);
        });
        entry.marker._sstIntelBound=true;
      }
    }
  }

  sstReading=function(x){
    if(!isFirms(x)) return baseSstReading(x);
    const m=fireMetrics(x);
    return `Detección satelital compatible con fuego activo${m.frp!==null?` (FRP ${f(m.frp)} MW)`:''}. Verificar primero exposición real, humo, tareas exteriores, instalaciones cercanas, accesos y evolución del foco.`;
  };

  renderImpactDetail=function(x){
    baseImpactDetail(x);
    if(!x || !isFirms(x)) return;
    const root=document.querySelector('#impactDetail');
    if(!root || root.querySelector('.firms-explain')) return;
    const m=fireMetrics(x);
    const section=document.createElement('section');
    section.className='firms-explain';
    section.innerHTML=`
      <div><span>🔥</span><p><b>Qué detectó el satélite</b><small>Una anomalía térmica compatible con fuego activo. No confirma por sí sola incendio estructural ni afectación de trabajadores.</small></p></div>
      <div><span>📍</span><p><b>${esc(locationText(x))}</b><small>Referencia territorial aproximada calculada desde las coordenadas del punto.</small></p></div>
      ${m.frp!==null?`<div><span>↗</span><p><b>FRP ${f(m.frp)} MW</b><small>Energía radiativa estimada. Útil para comparar intensidad y evolución, no para expresar tamaño del incendio.</small></p></div>`:''}`;
    const actions=root.querySelector('.impact-actions');
    if(actions) root.insertBefore(section,actions); else root.appendChild(section);
  };

  render=function(){
    baseRender();
    const items=filtered();
    enhanceFirmsCards(items);
    rebindMarkerPopups(items);
  };

  // Re-render inmediato para aplicar la nueva presentación a los datos ya cargados.
  try{render()}catch(e){console.warn('Mejora de inteligencia SST pendiente del siguiente refresco.',e)}
})();
