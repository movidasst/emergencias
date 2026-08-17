/* Interpretación técnica de la capa Exposición: explica qué variable dispara la prioridad y contra qué escala se compara. */
(() => {
  const baseRender = render;
  const baseImpactDetail = renderImpactDetail;

  function num(v){ const x=Number(v); return Number.isFinite(x)?x:null; }
  function fmt(v,d=1){ const x=num(v); return x===null?'—':x.toFixed(d).replace('.',','); }
  function metrics(x){ return x?.raw?.metrics || {}; }
  function cityOf(x){
    const t=String(x?.title||'');
    const parts=t.split('·').map(s=>s.trim()).filter(Boolean);
    return parts.length>1?parts[parts.length-1]:(x?.country||'Ubicación no indicada');
  }

  function uvCategory(v){
    const n=num(v);
    if(n===null)return {key:'na',label:'Sin dato',level:'info'};
    if(n>=11)return {key:'extreme',label:'Extremo',level:'high'};
    if(n>=8)return {key:'very-high',label:'Muy alto',level:'warning'};
    if(n>=6)return {key:'high',label:'Alto',level:'warning'};
    if(n>=3)return {key:'moderate',label:'Moderado',level:'attention'};
    return {key:'low',label:'Bajo',level:'ok'};
  }
  function aqiCategory(v){
    const n=num(v);
    if(n===null)return {key:'na',label:'Sin dato',level:'info'};
    if(n>=301)return {key:'hazardous',label:'Peligroso',level:'high'};
    if(n>=201)return {key:'very-unhealthy',label:'Muy insalubre',level:'high'};
    if(n>=151)return {key:'unhealthy',label:'Insalubre',level:'high'};
    if(n>=101)return {key:'sensitive',label:'Insalubre para grupos sensibles',level:'warning'};
    if(n>=51)return {key:'moderate',label:'Moderado',level:'attention'};
    return {key:'good',label:'Bueno',level:'ok'};
  }

  function drivers(x){
    const m=metrics(x);
    const uv=num(m.uv_index), aqi=num(m.us_aqi), apparent=num(m.apparent_temperature_c), gust=num(m.wind_gust_kmh);
    const out=[];
    if(uv!==null && uv>=11)out.push({rank:4,type:'uv',label:`UV EXTREMO ${fmt(uv)}`,why:`Índice UV ${fmt(uv)}: categoría Extremo (OMS, 11+).`});
    else if(uv!==null && uv>=8)out.push({rank:3,type:'uv',label:`UV MUY ALTO ${fmt(uv)}`,why:`Índice UV ${fmt(uv)}: categoría Muy alto (OMS, 8–10).`});
    else if(uv!==null && uv>=6)out.push({rank:2,type:'uv',label:`UV ALTO ${fmt(uv)}`,why:`Índice UV ${fmt(uv)}: categoría Alto (OMS, 6–7).`});
    else if(uv!==null && uv>=3)out.push({rank:1,type:'uv',label:`UV ${fmt(uv)} MODERADO`,why:`Índice UV ${fmt(uv)}: desde 3 la OMS recomienda protección solar.`});

    if(aqi!==null && aqi>=151)out.push({rank:4,type:'aqi',label:`AQI ${Math.round(aqi)} ${aqiCategory(aqi).label.toUpperCase()}`,why:`AQI US ${Math.round(aqi)}: ${aqiCategory(aqi).label} (EPA).`});
    else if(aqi!==null && aqi>=101)out.push({rank:3,type:'aqi',label:`AQI ${Math.round(aqi)} · GRUPOS SENSIBLES`,why:`AQI US ${Math.round(aqi)}: ${aqiCategory(aqi).label} (EPA).`});

    if(apparent!==null && apparent>=38)out.push({rank:2,type:'heat',label:`CALOR · VERIFICAR ${fmt(apparent)} °C`,why:`Sensación térmica ${fmt(apparent)} °C: activa el gatillo interno de vigilancia del monitor (≥38 °C); no equivale a WBGT.`});
    if(gust!==null && gust>=65)out.push({rank:2,type:'wind',label:`RÁFAGAS ${fmt(gust,0)} km/h`,why:`Ráfagas ${fmt(gust,0)} km/h: activa el gatillo interno del monitor (≥65 km/h).`});
    return out.sort((a,b)=>b.rank-a.rank);
  }

  function priorityInfo(x){
    const ds=drivers(x), lead=ds[0];
    if(!lead)return {className:'info',title:'CONTEXTO AMBIENTAL',lead:null};
    if(lead.rank>=4)return {className:'high',title:`PRIORIDAD SST ALTA — ${lead.label}`,lead};
    if(lead.rank>=2)return {className:'warning',title:`ATENCIÓN SST — ${lead.label}`,lead};
    return {className:'attention',title:`VIGILANCIA — ${lead.label}`,lead};
  }

  function whyText(x){
    const m=metrics(x), ds=drivers(x), p=priorityInfo(x);
    const pieces=[];
    if(p.lead)pieces.push(`La prioridad se debe principalmente a ${p.lead.why}`);
    const uv=num(m.uv_index), aqi=num(m.us_aqi), apparent=num(m.apparent_temperature_c);
    if(aqi!==null && aqi<101)pieces.push(`El AQI US es ${Math.round(aqi)} (${aqiCategory(aqi).label}) y no es el factor que eleva la prioridad.`);
    if(uv!==null && uv<8)pieces.push(`El UV es ${fmt(uv)} (${uvCategory(uv).label}).`);
    if(apparent!==null && apparent>=38)pieces.push(`Además, la sensación térmica es ${fmt(apparent)} °C y requiere verificar carga térmica ocupacional con el método aplicable.`);
    if(!pieces.length)pieces.push('No hay una variable que active prioridad automática alta; mantén vigilancia según la exposición real de la tarea.');
    return pieces.join(' ');
  }

  function actions(x){
    const m=metrics(x), uv=num(m.uv_index), aqi=num(m.us_aqi), apparent=num(m.apparent_temperature_c), gust=num(m.wind_gust_kmh);
    const a=[];
    if(uv!==null && uv>=8){
      a.push('Reprogramar o reducir tareas al sol alrededor del mediodía cuando sea posible; priorizar sombra y controles de ingeniería/organización.');
      a.push('Ropa de cobertura, sombrero adecuado, protección ocular UV y protector solar como complemento, no como único control.');
    }else if(uv!==null && uv>=3){
      a.push('Aplicar protección solar para trabajos exteriores; la OMS recomienda protección desde IUV 3.');
    }
    if(apparent!==null && apparent>=38){
      a.push('Revisar hidratación, pausas, sombra, aclimatación, carga física y duración; confirmar estrés térmico con WBGT u otro método ocupacional aplicable.');
    }
    if(aqi!==null && aqi>=101){
      a.push('Revisar tareas exteriores, personal sensible y exposición respiratoria; contrastar con medición local/OpenAQ cuando exista cobertura.');
    }
    if(gust!==null && gust>=65){
      a.push('Revisar trabajos en altura, izaje, objetos sueltos y tareas exteriores expuestas al viento.');
    }
    if(!a.length)a.push('Mantener vigilancia y relacionar las condiciones ambientales con la tarea, duración y controles reales del puesto de trabajo.');
    return a.slice(0,4);
  }

  function uvScale(current){
    const n=num(current);
    const bands=[
      ['0–2','Bajo',n!==null&&n<3],['3–5','Moderado',n!==null&&n>=3&&n<6],['6–7','Alto',n!==null&&n>=6&&n<8],['8–10','Muy alto',n!==null&&n>=8&&n<11],['11+','Extremo',n!==null&&n>=11]
    ];
    return `<div class="ref-scale uv-ref">${bands.map(([r,l,on])=>`<span class="${on?'current':''}"><b>${r}</b><small>${l}</small></span>`).join('')}</div>`;
  }
  function aqiScale(current){
    const n=num(current);
    const bands=[
      ['0–50','Bueno',n!==null&&n<=50],['51–100','Moderado',n!==null&&n>=51&&n<=100],['101–150','Grupos sensibles',n!==null&&n>=101&&n<=150],['151–200','Insalubre',n!==null&&n>=151&&n<=200],['201–300','Muy insalubre',n!==null&&n>=201&&n<=300],['301+','Peligroso',n!==null&&n>=301]
    ];
    return `<div class="ref-scale aqi-ref">${bands.map(([r,l,on])=>`<span class="${on?'current':''}"><b>${r}</b><small>${l}</small></span>`).join('')}</div>`;
  }

  function installStyles(){
    if(document.querySelector('#exposure-intel-css'))return;
    const s=document.createElement('style');
    s.id='exposure-intel-css';
    s.textContent=`
      .exposure-popup{max-width:365px}.exposure-priority{border-radius:10px;padding:9px 10px;font-size:10px;font-weight:900;letter-spacing:.02em;line-height:1.25}
      .exposure-priority.high{background:#fff0ee;color:#a7352b;border:1px solid #efc9c4}.exposure-priority.warning{background:#fff7e7;color:#8b5a00;border:1px solid #efd9aa}.exposure-priority.attention{background:#f2f8ed;color:#4f762f;border:1px solid #d5e5c9}.exposure-priority.info{background:#eef7f8;color:#007b85;border:1px solid #cae3e6}
      .exposure-why{background:#f7fafc;border:1px solid #dce7ec;border-radius:10px;padding:9px}.exposure-why>b,.exposure-actions>b,.exposure-ref>b{display:block;color:#00205b;font-size:10px;margin-bottom:4px}.exposure-why p,.exposure-actions li,.exposure-ref p{font-size:9.5px;line-height:1.4;color:#475569;margin:0}
      .exposure-actions{border:1px solid #dce7ec;border-radius:10px;padding:9px}.exposure-actions ul{margin:5px 0 0;padding-left:16px;display:grid;gap:4px}
      .exposure-ref{border:1px solid #dce7ec;border-radius:10px;padding:9px;background:#fff}.exposure-ref h6{font:800 9px Outfit;margin:7px 0 4px;color:#475569}
      .ref-scale{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:3px}.aqi-ref{grid-template-columns:repeat(3,minmax(0,1fr))}.ref-scale span{border:1px solid #e2e8f0;background:#f8fafc;border-radius:7px;padding:4px 3px;text-align:center;min-width:0}.ref-scale span.current{border:2px solid #007b85;background:#edf8f8}.ref-scale b{display:block;color:#0f2740;font-size:8px}.ref-scale small{display:block;color:#64748b;font-size:6.5px;line-height:1.15}
      .exposure-driver-line{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}.exposure-driver-line span{font-size:8px;font-weight:800;padding:4px 6px;border-radius:999px;background:#eef7f8;color:#007b85;border:1px solid #cbe5e7}
      .exposure-reference-card{margin:12px 0;padding:14px;border:1px solid #dce7ec;border-radius:16px;background:#fbfdfe}.exposure-reference-card h5{margin:0 0 5px;color:#00205b;font-size:14px}.exposure-reference-card>p{margin:0 0 10px;font-size:11px;line-height:1.45;color:#64748b}.exposure-reference-card .ref-scale{margin-bottom:10px}.exposure-reference-card .aqi-ref{grid-template-columns:repeat(6,minmax(0,1fr))}.ref-source{font-size:9px!important;color:#64748b!important;margin-top:7px!important}
      @media(max-width:520px){.exposure-reference-card .aqi-ref{grid-template-columns:repeat(3,minmax(0,1fr))}.ref-scale small{font-size:6px}}
    `;
    document.head.appendChild(s);
  }

  function popupHtml(x){
    const m=metrics(x), p=priorityInfo(x), ds=drivers(x);
    const uv=num(m.uv_index), aqi=num(m.us_aqi), apparent=num(m.apparent_temperature_c), temp=num(m.temperature_c), rh=num(m.relative_humidity_pct), gust=num(m.wind_gust_kmh);
    return `<div class="popup-card exposure-popup">
      <span class="popup-priority">EXPOSICIÓN AMBIENTAL</span>
      <strong>${esc(x.title)}</strong>
      <small>${esc([x.country,x.source,x.time].filter(Boolean).join(' · '))}</small>
      <div class="exposure-priority ${p.className}">${esc(p.title)}</div>
      <div class="exposure-driver-line">
        ${uv!==null?`<span>UV ${fmt(uv)} · ${uvCategory(uv).label}</span>`:''}
        ${aqi!==null?`<span>AQI ${Math.round(aqi)} · ${aqiCategory(aqi).label}</span>`:''}
        ${apparent!==null?`<span>Sensación ${fmt(apparent)} °C</span>`:''}
        ${gust!==null?`<span>Ráfagas ${fmt(gust,0)} km/h</span>`:''}
      </div>
      <section class="exposure-why"><b>¿Por qué tiene esta prioridad?</b><p>${esc(whyText(x))}</p></section>
      <section class="exposure-ref">
        <b>Referencia rápida</b>
        ${uv!==null?`<h6>Índice UV · OMS</h6>${uvScale(uv)}<p class="ref-source">Protección solar recomendada desde IUV 3; con IUV 8+ la OMS recomienda evitar el exterior alrededor del mediodía cuando sea posible.</p>`:''}
        ${aqi!==null?`<h6>AQI US · EPA</h6>${aqiScale(aqi)}`:''}
      </section>
      <section class="exposure-actions"><b>Qué verificar ahora</b><ul>${actions(x).map(a=>`<li>${esc(a)}</li>`).join('')}</ul></section>
      <p class="popup-caveat"><b>Importante:</b> temperatura/sensación térmica, UV y calidad del aire son contexto ambiental. Para estrés térmico ocupacional debe aplicarse WBGT u otro método válido; el monitor no sustituye mediciones higiénicas.</p>
      ${x.url?`<a class="popup-source" href="${esc(x.url)}" target="_blank" rel="noopener">Abrir fuente ↗</a>`:''}
    </div>`;
  }

  function enhanceCards(items){
    items.forEach(x=>{
      const card=document.querySelector(`.event-card[data-id="${CSS.escape(String(x.id))}"]`);
      if(!card)return;
      const p=priorityInfo(x), m=metrics(x), uv=num(m.uv_index), aqi=num(m.us_aqi);
      const sev=card.querySelector('.severity'); if(sev)sev.textContent=p.lead?p.lead.label:'AMBIENTAL';
      const mini=card.querySelector('.impact-mini b'); if(mini)mini.textContent=p.title;
      const note=card.querySelector('.sst-note span'); if(note)note.textContent=whyText(x);
      if(!card.querySelector('.exposure-driver-line')){
        const row=document.createElement('div');row.className='exposure-driver-line';
        row.innerHTML=`${uv!==null?`<span>UV ${fmt(uv)} · ${uvCategory(uv).label}</span>`:''}${aqi!==null?`<span>AQI ${Math.round(aqi)} · ${aqiCategory(aqi).label}</span>`:''}`;
        card.querySelector('.event-meta')?.insertAdjacentElement('afterend',row);
      }
    });
  }

  function rebindPopups(items){
    markers.forEach(entry=>{
      const x=items.find(i=>i.id===entry.id); if(!x)return;
      entry.marker.bindPopup(popupHtml(x),{maxWidth:390,minWidth:315});
    });
  }

  renderImpactDetail=function(x){
    baseImpactDetail(x);
    if(!x||activeFeed!=='air')return;
    const root=document.querySelector('#impactDetail'); if(!root)return;
    const m=metrics(x), uv=num(m.uv_index), aqi=num(m.us_aqi), p=priorityInfo(x);
    const level=root.querySelector('.impact-level'); if(level){level.textContent=p.title;level.className=`impact-level ${p.className==='high'?'high':p.className==='warning'?'medium':'low'}`;}
    const explain=root.querySelector('.impact-explain p'); if(explain)explain.textContent=whyText(x);
    if(root.querySelector('.exposure-reference-card'))return;
    const block=document.createElement('section');block.className='exposure-reference-card';
    block.innerHTML=`<h5>¿Contra qué referencia se compara?</h5><p>La prioridad debe decir qué variable la dispara. Estas escalas convierten el número en una categoría entendible.</p>
      ${uv!==null?`<b>Índice UV · OMS</b>${uvScale(uv)}<p class="ref-source">0–2 Bajo · 3–5 Moderado · 6–7 Alto · 8–10 Muy alto · 11+ Extremo. Protección recomendada desde IUV 3.</p>`:''}
      ${aqi!==null?`<b>AQI US · EPA</b>${aqiScale(aqi)}<p class="ref-source">0–50 Bueno · 51–100 Moderado · 101–150 Insalubre para grupos sensibles · 151–200 Insalubre · 201–300 Muy insalubre · 301+ Peligroso.</p>`:''}
      <p class="ref-source"><b>Calor:</b> la sensación térmica no es WBGT. El monitor usa ≥38 °C solo como gatillo interno de vigilancia; la decisión ocupacional requiere el método aplicable.</p>`;
    const actionsRoot=root.querySelector('.impact-actions'); if(actionsRoot)root.insertBefore(block,actionsRoot);else root.appendChild(block);
  };

  render=function(){
    baseRender();
    if(activeFeed!=='air')return;
    const items=filtered();
    enhanceCards(items);
    rebindPopups(items);
  };

  installStyles();
  if(activeFeed==='air'){try{render()}catch(e){console.warn('Interpretación de exposición pendiente del siguiente refresco.',e)}}
})();
