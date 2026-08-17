/* Guardia final: reaplica la semántica unificada después de cualquier enriquecimiento dinámico del popup. */
(() => {
  if (window.__movidaPopupSemanticGuardInstalled) return;
  window.__movidaPopupSemanticGuardInstalled = true;

  let observer = null;
  let resizeObserver = null;
  let active = null;
  let timer = null;
  let applying = false;

  function semantics(){ return window.MovidaSignalSemantics; }
  function apply(popup){
    if (!popup || applying || !semantics()?.applyPopup) return;
    applying = true;
    try {
      semantics().applyPopup(popup);
      /* Oculta el antiguo bloque específico de GDACS si quedó montado por compatibilidad.
         La nueva capa semántica es la única explicación visible. */
      const root=popup?.getElement?.()?.querySelector('.popup-card,.sst-popup');
      root?.querySelectorAll('.gdacs-definitive').forEach(n=>{ n.hidden=true; });
    }
    catch (e) { console.warn('Semántica final del popup', e); }
    finally { applying = false; }
    try { popup.update?.(); } catch {}
    requestAnimationFrame(() => { try { popup._adjustPan?.(); } catch {} });
  }
  function schedule(popup=active){
    if (!popup) return;
    clearTimeout(timer);
    timer=setTimeout(()=>apply(popup),55);
  }
  function stop(){ observer?.disconnect(); resizeObserver?.disconnect(); observer=null; resizeObserver=null; }
  function watch(popup){
    stop();
    const root=popup?.getElement?.()?.querySelector('.leaflet-popup-content');
    if(!root)return;
    observer=new MutationObserver(()=>schedule(popup));
    observer.observe(root,{childList:true,subtree:true,characterData:true});
    if('ResizeObserver' in window){resizeObserver=new ResizeObserver(()=>schedule(popup));resizeObserver.observe(root)}
  }

  if(typeof map!=='undefined'&&map?.on){
    map.on('popupopen',e=>{
      active=e.popup;
      [20,80,180,400,900,1600].forEach(ms=>setTimeout(()=>apply(e.popup),ms));
      setTimeout(()=>watch(e.popup),30);
    });
    map.on('popupclose',()=>{active=null;stop()});
  }
})();
