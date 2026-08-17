/* UX de popups Leaflet: evita tarjetas cortadas y fija la explicación operativa final. */
(() => {
  if (window.__movidaPopupUxInstalled) return;
  window.__movidaPopupUxInstalled = true;

  let activePopup = null;
  let mutationObserver = null;
  let resizeObserver = null;
  let reflowTimer = null;
  let patching = false;

  function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
  function popupMaxHeight(){
    const mapEl = typeof map !== 'undefined' && map?.getContainer ? map.getContainer() : null;
    const mapH = mapEl?.clientHeight || window.innerHeight || 700;
    const viewportH = window.innerHeight || mapH;
    return clamp(Math.min(Math.floor(mapH * 0.68), Math.floor(viewportH * 0.58)), 260, 440);
  }
  function popupMinWidth(){ return window.innerWidth <= 520 ? 250 : 290; }
  function popupMaxWidth(){ return Math.min(390, Math.max(280, window.innerWidth - 36)); }
  function esc(v){ return String(v ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  function itemForPopup(popup){
    const src = popup?._source;
    const entry = Array.isArray(window.markers) ? window.markers.find(m => m.marker === src) : (typeof markers !== 'undefined' && Array.isArray(markers) ? markers.find(m => m.marker === src) : null);
    const items = Array.isArray(window.rawItems) ? window.rawItems : (typeof rawItems !== 'undefined' && Array.isArray(rawItems) ? rawItems : []);
    return entry ? items.find(x => x.id === entry.id) : null;
  }

  function gdacsLevel(x){
    const m = x?.raw?.metrics || {};
    const s = [m.gdacs_alert_level,m.episode_alert_level,x?.title,x?.desc,x?.source].filter(Boolean).join(' ').toLowerCase();
    if (/\bred\b/.test(s)) return 'red';
    if (/\borange\b/.test(s)) return 'orange';
    if (/\bgreen\b/.test(s)) return 'green';
    return null;
  }
  function isGdacs(x){
    return /GDACS|Global Disaster Awareness/i.test([x?.source,x?.title,x?.desc].join(' ')) || gdacsLevel(x) !== null;
  }
  function isFlood(x){
    const s=[x?.title,x?.desc,x?.raw?.eventType,x?.raw?.event_type].join(' ').toLowerCase();
    return /flood|inundaci|\bfl\b|crecida|desbord/.test(s);
  }
  function colorEs(level){ return level==='red'?'roja':level==='orange'?'naranja':'verde'; }
  function colorUpper(level){ return level==='red'?'ROJO':level==='orange'?'NARANJA':'VERDE'; }
  function impactHuman(level){
    if(level==='red') return 'IMPACTO HUMANITARIO MUY ALTO';
    if(level==='orange') return 'IMPACTO HUMANITARIO CONSIDERABLE';
    return 'MENOR NIVEL HUMANITARIO GDACS';
  }
  function priorityName(level){ return level==='high'?'alta':level==='medium'?'media':'baja'; }

  function patchGdacsFlood(root,x){
    const level=gdacsLevel(x)||'green';
    const country=x?.country||'Venezuela';
    const desiredTitle=`Alerta ${colorEs(level)} GDACS por inundación en ${country}`;
    const already = root.dataset.movidaDefinitive === `gdacs-flood-${level}` &&
      root.querySelector('.gdacs-definitive') &&
      !root.querySelector('.signal-explain') &&
      (root.querySelector('.popup-title,strong')?.textContent||'').trim()===desiredTitle;
    if(already) return false;

    root.dataset.movidaDefinitive=`gdacs-flood-${level}`;
    root.querySelectorAll('.signal-explain').forEach(n=>n.remove());

    const title=root.querySelector('.popup-title') || root.querySelector(':scope > strong');
    if(title) title.textContent=desiredTitle;

    const kicker=root.querySelector('.popup-kicker span') || root.querySelector('.popup-priority');
    if(kicker) kicker.textContent=`GDACS · NIVEL ${colorUpper(level)} · ${impactHuman(level)}`;

    const facts=root.querySelector('.popup-facts');
    if(facts){
      const first=facts.querySelector('p');
      if(first){
        const b=first.querySelector('b'); if(b)b.textContent='📍 Referencia';
        if(!facts.querySelector('.gdacs-location-note')){
          const note=document.createElement('p');
          note.className='gdacs-location-note';
          note.innerHTML='<b>ℹ️ Alcance</b><span>Punto/coordenada de referencia del evento. No significa que toda la ciudad o todo el país estén inundados.</span>';
          first.insertAdjacentElement('afterend',note);
        }
      }
    }

    const meaning=root.querySelector('.popup-meaning');
    if(meaning){
      meaning.innerHTML=`<b>¿Qué es esta alerta?</b><p>GDACS reporta un <strong>evento de inundación</strong> en ${esc(country)} y le asigna nivel <strong>${colorUpper(level)}</strong> dentro de su escala humanitaria global.</p>`;
      meaning.insertAdjacentHTML('afterend',`
        <section class="gdacs-definitive gdacs-${level}">
          <div class="gdacs-def-head"><b>¿Qué significa nivel ${colorUpper(level)}?</b><span>GDACS</span></div>
          ${level==='green'?`<p>Es el <strong>nivel humanitario global más bajo</strong> de GDACS para inundaciones. Incluye los eventos que no alcanzan los umbrales de Naranja o Rojo.</p>
          <p class="gdacs-no"><b>No significa:</b> “sin inundación”, “sin peligro”, “agua baja” ni que una instalación concreta esté segura.</p>
          <p class="gdacs-ref"><b>Referencia GDACS:</b> Naranja cuando se reportan más de 100 fallecidos o 80.000 desplazados; Rojo cuando supera 1.000 fallecidos o 800.000 desplazados. Verde corresponde al resto de inundaciones.</p>`:
          level==='orange'?`<p>GDACS la ubica en un nivel humanitario considerable. Para inundaciones, Naranja se utiliza cuando la información supera 100 fallecidos o 80.000 desplazados.</p><p class="gdacs-no"><b>No significa:</b> una profundidad específica del agua ni afectación confirmada de una sede determinada.</p>`:
          `<p>Es el nivel humanitario global más alto de GDACS para inundaciones. Se utiliza cuando la información supera 1.000 fallecidos o 800.000 desplazados.</p><p class="gdacs-no"><b>No significa:</b> que toda Venezuela tenga el mismo nivel de afectación; la exposición debe verificarse localmente.</p>`}
          <div class="gdacs-sst"><b>Qué significa para SST</b><p>La decisión depende de si el área realmente afectada coincide con trabajadores, sedes, zonas bajas, drenajes, accesos, rutas de transporte o servicios críticos de la organización.</p></div>
        </section>`);
    }

    const impact=root.querySelector('.popup-impact');
    if(impact){
      let model=null; try{ model=typeof impactModel==='function'?impactModel(x):null; }catch{}
      const p=model?.level||'medium';
      impact.classList.remove('high','medium','low');impact.classList.add(p);
      impact.innerHTML=`<b>Prioridad preventiva ${priorityName(p)} · no es impacto confirmado</b><p>${p==='medium'?'El monitor la eleva a prioridad media porque la señal de inundación está dentro de Venezuela y tiene relevancia territorial. Esto NO significa que exista un “impacto medio” comprobado.':'La prioridad del monitor sirve para ordenar qué revisar; no representa daños ni personas afectadas confirmadas.'}</p>`;
    }

    const check=root.querySelector('.popup-check');
    if(check){
      check.innerHTML=`<b>Qué verificar ahora</b><ul>
        <li>Confirmar <strong>municipio, sector, río/cuenca o polígono realmente afectado</strong> y la evolución del evento.</li>
        <li>Verificar trabajadores en campo, sedes y tareas ubicadas en <strong>zonas bajas o próximas a drenajes/cauces</strong>.</li>
        <li>Comprobar accesos, rutas de transporte, pasos vulnerables, servicios y alternativas de continuidad.</li>
        <li>Contrastar la situación local con Protección Civil, INAMEH y autoridades competentes antes de ordenar evacuaciones, cierres o desplazamientos.</li>
      </ul>`;
    }
    return true;
  }

  function patchPopupContent(popup){
    if(patching) return;
    const x=itemForPopup(popup);
    const root=popup?.getElement?.()?.querySelector('.popup-card,.sst-popup');
    if(!x||!root) return;
    patching=true;
    try{
      if(isGdacs(x) && isFlood(x)) patchGdacsFlood(root,x);
    }finally{patching=false;}
  }

  function stylePopupElement(popup){
    const el = popup?.getElement?.();
    if (!el) return;
    el.classList.add('movida-popup-controlled');
    el.style.setProperty('--movida-popup-max-height', `${popupMaxHeight()}px`);
    const content = el.querySelector('.leaflet-popup-content');
    if (!content) return;
    content.scrollTop = 0;
    if (typeof L !== 'undefined' && L?.DomEvent) {
      L.DomEvent.disableScrollPropagation(content);
      L.DomEvent.disableClickPropagation(content);
    }
  }

  function adjustPopup(popup, resetScroll = false){
    if (!popup) return;
    const maxHeight = popupMaxHeight();
    popup.options.maxHeight = maxHeight;
    popup.options.maxWidth = popupMaxWidth();
    popup.options.minWidth = popupMinWidth();
    popup.options.autoPan = true;
    popup.options.keepInView = true;
    popup.options.autoPanPaddingTopLeft = [22, 72];
    popup.options.autoPanPaddingBottomRight = [22, 52];
    const el = popup.getElement?.();
    if (el) el.style.setProperty('--movida-popup-max-height', `${maxHeight}px`);
    try { popup.update(); } catch {}
    const content = popup.getElement?.()?.querySelector('.leaflet-popup-content');
    if (resetScroll && content) content.scrollTop = 0;
    requestAnimationFrame(() => {
      try { popup.update(); } catch {}
      try { if (typeof popup._adjustPan === 'function') popup._adjustPan(); } catch {}
    });
  }

  function scheduleReflow(popup = activePopup){
    if (!popup) return;
    clearTimeout(reflowTimer);
    reflowTimer = setTimeout(() => { patchPopupContent(popup); adjustPopup(popup, false); }, 45);
  }
  function disconnectObservers(){
    mutationObserver?.disconnect(); resizeObserver?.disconnect();
    mutationObserver = null; resizeObserver = null;
  }
  function observePopup(popup){
    disconnectObservers();
    const content = popup?.getElement?.()?.querySelector('.leaflet-popup-content');
    if (!content) return;
    mutationObserver = new MutationObserver(() => scheduleReflow(popup));
    mutationObserver.observe(content,{childList:true,subtree:true,characterData:true,attributes:true});
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(() => scheduleReflow(popup));
      resizeObserver.observe(content);
    }
  }

  function installCss(){
    if (document.getElementById('movida-popup-ux-css')) return;
    const style = document.createElement('style');
    style.id = 'movida-popup-ux-css';
    style.textContent = `
      .leaflet-popup.movida-popup-controlled .leaflet-popup-content-wrapper{overflow:hidden;border-radius:16px}
      .leaflet-popup.movida-popup-controlled .leaflet-popup-content{max-height:var(--movida-popup-max-height,390px)!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-gutter:stable;margin:10px 12px 12px!important;padding-right:4px}
      .leaflet-popup.movida-popup-controlled .leaflet-popup-content::-webkit-scrollbar{width:7px}.leaflet-popup.movida-popup-controlled .leaflet-popup-content::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:999px}.leaflet-popup.movida-popup-controlled .leaflet-popup-content::-webkit-scrollbar-track{background:transparent}
      .leaflet-popup.movida-popup-controlled .leaflet-popup-close-button{width:28px!important;height:28px!important;line-height:25px!important;top:5px!important;right:5px!important;z-index:20;border-radius:999px;background:rgba(255,255,255,.94)!important;box-shadow:0 1px 5px rgba(15,39,64,.12)}
      .leaflet-popup.movida-popup-controlled .popup-card,.leaflet-popup.movida-popup-controlled .sst-popup{max-width:none!important;min-width:0!important;width:100%;box-sizing:border-box}
      .gdacs-definitive{border:1px solid #d8e4e9;border-radius:11px;padding:9px;background:#fbfdfe;display:grid;gap:6px}.gdacs-def-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.gdacs-def-head>b{font-size:10px;color:#00205b}.gdacs-def-head>span{font-size:8px;font-weight:900;border-radius:999px;padding:4px 6px;background:#eef8ec;color:#477c31}.gdacs-definitive p{margin:0!important;padding:0!important;background:none!important;font-size:9.5px!important;line-height:1.45!important;color:#475569!important}.gdacs-no{border-left:3px solid #ffb600;padding-left:7px!important}.gdacs-ref{font-size:8.8px!important;color:#64748b!important}.gdacs-sst{border-left:3px solid #007b85;padding:7px;background:#f2fafa;border-radius:0 8px 8px 0}.gdacs-sst>b{display:block;color:#007b85;font-size:9px;text-transform:uppercase;margin-bottom:2px}.gdacs-location-note span{font-size:9px;color:#64748b}
      @media(max-width:520px){.leaflet-popup.movida-popup-controlled .leaflet-popup-content{margin:9px 10px 10px!important;padding-right:3px}}
    `;
    document.head.appendChild(style);
  }

  installCss();
  if (typeof map !== 'undefined' && map?.on) {
    map.on('popupopen', e => {
      activePopup = e.popup;
      requestAnimationFrame(() => {
        stylePopupElement(e.popup);
        patchPopupContent(e.popup);
        adjustPopup(e.popup, true);
        observePopup(e.popup);
        [80,180,350,700].forEach(ms=>setTimeout(()=>{patchPopupContent(e.popup);scheduleReflow(e.popup);},ms));
      });
    });
    map.on('popupclose', () => { activePopup = null; disconnectObservers(); });
  }
  window.addEventListener('resize', () => scheduleReflow());
})();
