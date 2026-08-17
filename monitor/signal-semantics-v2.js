/* Hotfix semántico V2: resuelve de forma robusta el evento de cada popup y fuerza la explicación final. */
(() => {
  if (window.__movidaSignalSemanticsV2) return;
  window.__movidaSignalSemanticsV2 = true;

  let installed = false;
  let activePopup = null;
  let observer = null;
  let timer = null;

  function txt(v){ return String(v ?? '').trim(); }
  function esc(v){ return txt(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function getItems(){
    try { return Array.isArray(rawItems) ? rawItems : []; } catch { return []; }
  }
  function getMarkers(){
    try { return Array.isArray(markers) ? markers : []; } catch { return []; }
  }
  function currentTitle(root){
    return txt(root?.querySelector('.popup-title')?.textContent || root?.querySelector(':scope > strong')?.textContent || root?.querySelector('strong')?.textContent);
  }
  function coordsOfItem(x){
    const lat=Number(x?.lat), lon=Number(x?.lon);
    return Number.isFinite(lat)&&Number.isFinite(lon)?{lat,lon}:null;
  }
  function distanceScore(a,b){
    if(!a||!b)return Infinity;
    return Math.abs(a.lat-b.lat)+Math.abs(a.lon-b.lng);
  }

  function resolveItem(popup){
    const items=getItems();
    if(!items.length)return null;
    const source=popup?._source;

    // 1. Vínculo exacto marker -> id.
    const entry=getMarkers().find(m=>m?.marker===source);
    if(entry){
      const exact=items.find(x=>String(x.id)===String(entry.id));
      if(exact)return exact;
    }

    const root=popup?.getElement?.()?.querySelector('.popup-card,.sst-popup');
    const shownTitle=currentTitle(root).toLowerCase();

    // 2. Coordenadas del marcador. Es más robusto cuando otra capa rebindea el popup.
    let ll=null;
    try{ ll=source?.getLatLng?.() || popup?.getLatLng?.(); }catch{}
    if(ll && Number.isFinite(Number(ll.lat)) && Number.isFinite(Number(ll.lng))){
      const ranked=items
        .map(x=>({x,c:coordsOfItem(x)}))
        .filter(o=>o.c)
        .map(o=>({x:o.x,d:distanceScore(o.c,ll)}))
        .sort((a,b)=>a.d-b.d);
      const near=ranked.filter(o=>o.d<0.0025); // ~centenas de metros, suficiente para redondeos del feed.
      if(near.length===1)return near[0].x;
      if(near.length>1 && shownTitle){
        const byTitle=near.find(o=>{
          const raw=txt(o.x.title).toLowerCase();
          let translated='';
          try{ translated=txt(window.MovidaSignalSemantics?.titleFor?.(o.x)).toLowerCase(); }catch{}
          return raw===shownTitle || translated===shownTitle || shownTitle.includes(raw) || (translated&&shownTitle.includes(translated));
        });
        if(byTitle)return byTitle.x;
      }
      if(ranked[0]?.d<0.01)return ranked[0].x;
    }

    // 3. Título visible contra título original o traducido.
    if(shownTitle){
      const byTitle=items.find(x=>{
        const raw=txt(x.title).toLowerCase();
        let translated='';
        try{ translated=txt(window.MovidaSignalSemantics?.titleFor?.(x)).toLowerCase(); }catch{}
        return raw===shownTitle || translated===shownTitle || shownTitle.includes(raw) || (translated&&shownTitle.includes(translated));
      });
      if(byTitle)return byTitle;
    }
    return null;
  }

  function priorityLabel(level){ return level==='high'?'alta':level==='medium'?'media':'baja'; }
  function applyPopupV2(popup){
    const api=window.MovidaSignalSemantics;
    if(!api?.analyze)return false;
    const x=resolveItem(popup);
    const root=popup?.getElement?.()?.querySelector('.popup-card,.sst-popup');
    if(!x||!root)return false;

    const sem=api.analyze(x);
    if(!sem||sem.skip)return false;
    root.dataset.semanticV2=String(x.id||'1');

    // Limpia explicaciones antiguas/generales antes de escribir la definitiva.
    root.querySelectorAll('.signal-explain,.semantic-explain,.semantic-v2-explain').forEach(n=>n.remove());

    const title=root.querySelector('.popup-title') || root.querySelector(':scope > strong') || root.querySelector('strong');
    if(title)title.textContent=sem.title;

    const badge=root.querySelector('.popup-kicker span') || root.querySelector('.popup-priority');
    if(badge){
      badge.textContent=sem.badge || 'SEÑAL · VERIFICAR';
      badge.classList.remove('critical','warning','advisory');
      badge.classList.add(sem.tone||'advisory');
    }

    const meaning=root.querySelector('.popup-meaning');
    if(meaning){
      meaning.innerHTML=`<b>¿Qué es esta señal?</b><p>${esc(sem.meaning)}</p>`;
      meaning.insertAdjacentHTML('afterend',`
        <section class="semantic-v2-explain">
          <p class="semantic-v2-no"><b>Esto NO significa:</b> ${esc(sem.notMeans)}</p>
          ${sem.reference?`<p class="semantic-v2-ref"><b>Cómo se interpreta:</b> ${esc(sem.reference)}</p>`:''}
          <div class="semantic-v2-sst"><b>Qué significa para SST</b><p>${esc(sem.sst)}</p></div>
        </section>`);
    }else{
      root.insertAdjacentHTML('afterbegin',`
        <section class="semantic-v2-explain">
          <div><b>¿Qué es esta señal?</b><p>${esc(sem.meaning)}</p></div>
          <p class="semantic-v2-no"><b>Esto NO significa:</b> ${esc(sem.notMeans)}</p>
          ${sem.reference?`<p class="semantic-v2-ref"><b>Cómo se interpreta:</b> ${esc(sem.reference)}</p>`:''}
          <div class="semantic-v2-sst"><b>Qué significa para SST</b><p>${esc(sem.sst)}</p></div>
        </section>`);
    }

    let model={level:'low',proximity:''};
    try{model=impactModel(x)}catch{}
    const impact=root.querySelector('.popup-impact');
    if(impact){
      impact.className=`popup-impact ${model.level||'low'}`;
      impact.innerHTML=`<b>Prioridad preventiva ${priorityLabel(model.level)} · cálculo interno</b><p>Sirve para ordenar qué verificar primero. No es una escala oficial de la fuente y no confirma daños, lesionados ni personas afectadas.</p>`;
    }

    const check=root.querySelector('.popup-check');
    if(check){
      check.innerHTML=`<b>Qué verificar ahora</b><ul>${(sem.actions||[]).map(a=>`<li>${esc(a)}</li>`).join('')}</ul>`;
    }

    const facts=root.querySelector('.popup-facts');
    if(facts && !facts.querySelector('.semantic-v2-source')){
      const p=document.createElement('p');
      p.className='semantic-v2-source';
      p.innerHTML=`<b>🔎 Fuente</b><span>${esc(x.source||sem.provider||'Fuente original')}</span>`;
      facts.appendChild(p);
    }

    try{popup.update?.()}catch{}
    requestAnimationFrame(()=>{try{popup._adjustPan?.()}catch{}});
    return true;
  }

  function postProcessCards(){
    const api=window.MovidaSignalSemantics;
    if(!api?.applyCard)return;
    for(const x of getItems()){
      try{api.applyCard(x)}catch{}
    }
  }
  function postProcessDetail(){
    const api=window.MovidaSignalSemantics;
    if(!api?.applyDetail)return;
    try{
      const selected=typeof selectedImpactId!=='undefined'?getItems().find(x=>String(x.id)===String(selectedImpactId)):null;
      if(selected)api.applyDetail(selected);
    }catch{}
  }

  function schedule(popup=activePopup){
    if(!popup)return;
    clearTimeout(timer);
    timer=setTimeout(()=>applyPopupV2(popup),45);
  }
  function watch(popup){
    observer?.disconnect();
    const content=popup?.getElement?.()?.querySelector('.leaflet-popup-content');
    if(!content)return;
    observer=new MutationObserver(()=>schedule(popup));
    observer.observe(content,{childList:true,subtree:true,characterData:true});
  }
  function css(){
    if(document.getElementById('semantic-v2-css'))return;
    const s=document.createElement('style');
    s.id='semantic-v2-css';
    s.textContent=`
      .semantic-v2-explain{margin:8px 0;border:1px solid #d8e4e9;border-radius:11px;padding:9px;background:#fbfdfe;display:grid;gap:7px}
      .semantic-v2-explain p{margin:0!important;padding:0!important;background:none!important;font-size:9.5px!important;line-height:1.45!important;color:#475569!important}
      .semantic-v2-no{border-left:3px solid #ffb600;padding-left:7px!important}
      .semantic-v2-ref{font-size:8.8px!important;color:#64748b!important}
      .semantic-v2-sst{border-left:3px solid #007b85;padding:7px;background:#f2fafa;border-radius:0 8px 8px 0}
      .semantic-v2-sst>b{display:block;color:#007b85;font-size:9px;text-transform:uppercase;margin-bottom:2px}
      .semantic-v2-source span{font-size:9px;color:#64748b}
    `;
    document.head.appendChild(s);
  }

  function install(){
    if(installed)return;
    const api=window.MovidaSignalSemantics;
    if(!api?.analyze){setTimeout(install,80);return;}
    installed=true;
    css();

    // Reemplaza el método público que usa la guardia semántica existente.
    api.applyPopup=applyPopupV2;

    if(typeof map!=='undefined'&&map?.on){
      map.on('popupopen',e=>{
        activePopup=e.popup;
        [0,40,120,300,700,1400].forEach(ms=>setTimeout(()=>applyPopupV2(e.popup),ms));
        setTimeout(()=>watch(e.popup),25);
      });
      map.on('popupclose',()=>{activePopup=null;observer?.disconnect();observer=null;});
    }

    const list=document.getElementById('feedList');
    if(list)new MutationObserver(()=>setTimeout(postProcessCards,20)).observe(list,{childList:true,subtree:true});
    const detail=document.getElementById('impactDetail');
    if(detail)new MutationObserver(()=>setTimeout(postProcessDetail,20)).observe(detail,{childList:true,subtree:true});

    postProcessCards();
    postProcessDetail();
  }

  install();
})();