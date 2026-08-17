/* UX de popups Leaflet: evita tarjetas cortadas y recentra tras enriquecimiento dinámico. */
(() => {
  if (window.__movidaPopupUxInstalled) return;
  window.__movidaPopupUxInstalled = true;

  let activePopup = null;
  let mutationObserver = null;
  let resizeObserver = null;
  let reflowTimer = null;

  function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
  function popupMaxHeight(){
    const mapEl = typeof map !== 'undefined' && map?.getContainer ? map.getContainer() : null;
    const mapH = mapEl?.clientHeight || window.innerHeight || 700;
    const viewportH = window.innerHeight || mapH;
    return clamp(Math.min(Math.floor(mapH * 0.68), Math.floor(viewportH * 0.58)), 260, 440);
  }
  function popupMinWidth(){ return window.innerWidth <= 520 ? 250 : 290; }
  function popupMaxWidth(){ return Math.min(390, Math.max(280, window.innerWidth - 36)); }

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
    reflowTimer = setTimeout(() => adjustPopup(popup, false), 45);
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
      .leaflet-popup.movida-popup-controlled .leaflet-popup-content{
        max-height:var(--movida-popup-max-height,390px)!important;
        overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain;
        scrollbar-width:thin;scrollbar-gutter:stable;margin:10px 12px 12px!important;padding-right:4px
      }
      .leaflet-popup.movida-popup-controlled .leaflet-popup-content::-webkit-scrollbar{width:7px}
      .leaflet-popup.movida-popup-controlled .leaflet-popup-content::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:999px}
      .leaflet-popup.movida-popup-controlled .leaflet-popup-content::-webkit-scrollbar-track{background:transparent}
      .leaflet-popup.movida-popup-controlled .leaflet-popup-close-button{
        width:28px!important;height:28px!important;line-height:25px!important;top:5px!important;right:5px!important;
        z-index:20;border-radius:999px;background:rgba(255,255,255,.94)!important;box-shadow:0 1px 5px rgba(15,39,64,.12)
      }
      .leaflet-popup.movida-popup-controlled .popup-card,.leaflet-popup.movida-popup-controlled .sst-popup{
        max-width:none!important;min-width:0!important;width:100%;box-sizing:border-box
      }
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
        adjustPopup(e.popup, true);
        observePopup(e.popup);
        setTimeout(() => scheduleReflow(e.popup), 120);
        setTimeout(() => scheduleReflow(e.popup), 350);
      });
    });
    map.on('popupclose', () => { activePopup = null; disconnectObservers(); });
  }
  window.addEventListener('resize', () => scheduleReflow());
})();
