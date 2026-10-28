// Navigazione mobile. Nessuna libreria esterna e nessuna richiesta di rete.
(() => {
  const button = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.nav-links');
  if (!button || !nav) return;
  const close = () => { button.setAttribute('aria-expanded','false'); button.setAttribute('aria-label','Apri il menu'); nav.classList.remove('open'); };
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Chiudi il menu' : 'Apri il menu');
    nav.classList.toggle('open', open);
  });
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
  document.addEventListener('keydown', event => { if(event.key === 'Escape') close(); });
  document.addEventListener('click', event => { if(!nav.contains(event.target) && !button.contains(event.target)) close(); });
  window.addEventListener('resize', () => { if(window.innerWidth > 820) close(); });
})();

// BELLEMO 0026 — geometria della firma gestita interamente via CSS.
// Nessun ResizeObserver, misura nascosta o variazione geometrica dopo il primo paint.

/* BELLEMO 0064 — Un'unica dicitura DOM persistente su desktop.
   Il router 0057 sostituisce solo MAIN: questo elemento resta immutato
   tra Home, Profilo e le altre nove pagine. Il CSS garantisce lo stesso
   ancoraggio relativo al BODY e nasconde le copie solo dopo il montaggio. */
(() => {
  const existing = document.getElementById('bellemo-shared-eyebrow-shell');
  if (existing) return;
  const source = document.querySelector(
    'main .hero-copy > .eyebrow, main .page-intro-content > .eyebrow'
  );
  if (!source) return;
  const shell = document.createElement('div');
  shell.id = 'bellemo-shared-eyebrow-shell';
  shell.setAttribute('aria-hidden', 'true');
  const label = source.cloneNode(true);
  label.removeAttribute('style');
  shell.appendChild(label);
  document.body.appendChild(shell);
  document.documentElement.classList.add('bellemo-shared-label-ready');
})();

/* ===========================================================================
   BELLEMO 0057 — NAVIGAZIONE SENZA RICARICAMENTO COMPLETO.
   La testata, il pie' di pagina e il body (con il fondale geometrico approvato)
   restano gli STESSI elementi del DOM. Si aggiorna soltanto <main>, il titolo,
   la classe del body e il collegamento attivo nel menu.
   - URL reali delle 11 pagine conservati (History API).
   - Indietro/Avanti, accesso diretto e link esterni gestiti normalmente.
   - Fallback al caricamento ordinario se fetch o parsing non riescono.
   - Nessuna animazione e nessuna modifica alla resa dello sfondo 0056.
   =========================================================================== */
(() => {
  'use strict';

  // Non alterare la navigazione degli utenti quando le API sono indisponibili.
  if (!window.fetch || !window.DOMParser || !window.history.pushState) return;

  // Ordine delle sei aree: identico alla pagina "Aree di attività".
  // La prima e l'ultima sono adiacenti nella navigazione circolare mobile.
  const sectorSequence = [
    'sinistri-stradali.html', 'infortuni-lavoro.html',
    'responsabilita-sanitaria.html', 'responsabilita-civile.html',
    'controversie-assicurative.html', 'assistenza-legale-integrata.html'
  ];

  const pages = new Set([
    'index.html', 'profilo.html', 'settori.html', 'metodo.html', 'contatti.html',
    'sinistri-stradali.html', 'infortuni-lavoro.html',
    'responsabilita-sanitaria.html', 'responsabilita-civile.html',
    'controversie-assicurative.html', 'assistenza-legale-integrata.html'
  ]);

  // Tutte le pagine risiedono nella stessa directory. Non intercettare altri siti.
  const home = new URL('index.html', document.baseURI);
  const directory = home.pathname.slice(0, home.pathname.lastIndexOf('/') + 1);
  const cache = new Map();
  let navigationSequence = 0;

  function internalPage(address) {
    let url;
    try { url = new URL(address, document.baseURI); } catch (_) { return null; }
    if (url.origin !== home.origin || !url.pathname.startsWith(directory)) return null;
    const filename = url.pathname.slice(directory.length);
    if (!pages.has(filename)) return null;
    return url;
  }

  function cacheKey(url) { return url.pathname + url.search; }

  async function getDocument(url) {
    const key = cacheKey(url);
    if (!cache.has(key)) {
      const job = (async () => {
        const response = await fetch(url.href, {
          method: 'GET',
          credentials: 'same-origin',
          headers: { 'Accept': 'text/html' }
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const source = await response.text();
        const page = new DOMParser().parseFromString(source, 'text/html');
        if (!page.querySelector('main#contenuto') || !page.body ||
            !page.querySelector('header#inizio') || !page.querySelector('title')) {
          throw new Error('Documento HTML incompleto');
        }
        return page;
      })();
      cache.set(key, job);
      // Un errore transitorio non deve rimanere nella cache.
      job.catch(() => { if (cache.get(key) === job) cache.delete(key); });
    }
    return cache.get(key);
  }

  /* BELLEMO 0066 — la fine del download NON equivale a un'immagine pronta.
     Conserviamo una sola immagine di precaricamento per URL e attendiamo
     decode(), che garantisce la disponibilita' dei pixel prima del drag.
     Se la panoramica non e' decodificabile, non mostriamo un pannello vuoto. */
  const decodedImages = new Map();
  function preloadDecoded(src) {
    const absolute = new URL(src, document.baseURI).href;
    if (!decodedImages.has(absolute)) {
      const picture = new Image();
      picture.decoding = 'sync';
      picture.loading = 'eager';
      picture.src = absolute;
      const job = picture.decode().then(() => {
        if (!picture.naturalWidth) throw new Error('Immagine senza dimensioni: ' + src);
        return picture;
      }).catch(error => {
        if (decodedImages.get(absolute) === job) decodedImages.delete(absolute);
        throw error;
      });
      decodedImages.set(absolute, job);
    }
    return decodedImages.get(absolute);
  }

  /* BELLEMO 0067 — le sei panoramiche mobile hanno risorse WebP dedicate.
     Il documento analizzato da DOMParser non e' nel DOM attivo, percio'
     currentSrc non e' affidabile: selezioniamo la SOURCE del PICTURE
     con la stessa media query che usa il browser, senza toccare il desktop. */
  function effectiveImageSource(img) {
    if (img.parentElement && img.parentElement.tagName === 'PICTURE') {
      for (const source of img.parentElement.querySelectorAll('source[srcset]')) {
        const media = source.getAttribute('media');
        if (!media || window.matchMedia(media).matches) {
          return source.getAttribute('srcset'); // Un unico URL, non una lista.
        }
      }
    }
    return img.getAttribute('src');
  }

  async function prepareImages(page) {
    const images = Array.from(page.querySelectorAll('main img'))
      .filter(img => img.getAttribute('loading') !== 'lazy');
    await Promise.all(images.map(img => {
      const src = effectiveImageSource(img);
      if (!src) return Promise.resolve();
      // Le panoramiche devono essere decodificate prima dello swipe.
      return preloadDecoded(src).catch(error => {
        if (img.matches('.sector-banner-photo')) throw error;
      });
    }));
  }

  /* BELLEMO 0068 — collegamento REALE dei parametri scritti nell'index.
     Funziona dalla Home e da tutte le pagine aperte direttamente.
     Le fotografie desktop mantengono obbligatoriamente la resa originale. */
  const mobileFocusSettings = (async () => {
    try {
      const local = document.getElementById('bellemo-mobile-banner-focus');
      let raw;
      if (local) raw = local.textContent;
      else {
        const response = await fetch(home.href, {cache:'no-store',credentials:'same-origin'});
        if (!response.ok) throw new Error('Impossibile leggere index.html');
        const doc = new DOMParser().parseFromString(await response.text(),'text/html');
        raw = doc.getElementById('bellemo-mobile-banner-focus')?.textContent;
      }
      return raw ? JSON.parse(raw) : {};
    } catch (error) { console.error('Regolazione fotografie Bellemo non caricata:',error); return {}; }
  })();
  let activeMobileFocus = {};
  /* BELLEMO 0073 — REGOLAZIONE FOTOGRAFICA SENZA AREE SCOPERTE.
     Il vecchio translate() spostava la cornice dell'IMG e mostrava lo sfondo
     grigio. Ora dimensioniamo i pixel della foto sull'intero contenitore
     (cover reale), aggiungiamo lo zoom e spostiamo il rettangolo fotografico.
     Le coordinate X/Y vengono limitate alla parte realmente disponibile:
     nessun bordo dell'immagine puo' entrare nella finestra visibile.
     Geometria identica nel MAIN e nelle copie usate per lo swipe. */
  function positionMobileBanner(img) {
    if (!img || !window.matchMedia('(max-width:820px)').matches) return false;
    const banner=img.closest('.sector-banner');
    if (!banner) return false;
    const w=banner.clientWidth,h=banner.clientHeight;
    const iw=img.naturalWidth,ih=img.naturalHeight;
    if (!w || !h || !iw || !ih) return false;
    const zoom=Math.max(1,Number(img.dataset.bellemoZoom)||1);
    const x=Number(img.dataset.bellemoX)||0;
    const y=Number(img.dataset.bellemoY)||0;
    const scale=Math.max(w/iw,h/ih)*zoom;
    // Lieve sovrabbondanza subpixel per escludere fessure di antialiasing.
    const photoWidth=iw*scale+0.04,photoHeight=ih*scale+0.04;
    const focalX=window.matchMedia('(max-width:560px)').matches?.68:.65;
    const left=Math.max(w-photoWidth,Math.min(0,(w-photoWidth)*focalX+x));
    const top=Math.max(h-photoHeight,Math.min(0,(h-photoHeight)*.5+y));
    img.classList.add('bellemo-mobile-photo-framed');
    img.style.setProperty('width',photoWidth+'px');
    img.style.setProperty('height',photoHeight+'px');
    img.style.setProperty('left',left+'px');
    img.style.setProperty('top',top+'px');
    img.style.setProperty('right','auto');
    img.style.setProperty('bottom','auto');
    img.style.setProperty('transform','none');
    return true;
  }
  function resetMobileBanner(img) {
    img.classList.remove('bellemo-mobile-photo-framed');
    for (const p of ['width','height','left','top','right','bottom','transform'])
      img.style.removeProperty(p);
  }
  function applyMobileBannerFocus(root, name) {
    if (!root) return;
    const filename=name || location.pathname.split('/').pop();
    const f=activeMobileFocus[filename] || {};
    for (const img of root.querySelectorAll('.sector-banner-photo')) {
      const zoom=Number(f.zoom),x=Number(f.x),y=Number(f.y);
      img.dataset.bellemoZoom=Number.isFinite(zoom)?Math.max(1,zoom/100):1;
      img.dataset.bellemoX=Number.isFinite(x)?x:0;
      img.dataset.bellemoY=Number.isFinite(y)?y:0;
      if (window.matchMedia('(max-width:820px)').matches) {
        if (!positionMobileBanner(img)) {
          // Elemento ancora staccato dal DOM / immagine non pronta.
          img.addEventListener('load',()=>positionMobileBanner(img),{once:true});
        }
      } else resetMobileBanner(img);
    }
  }
  function refreshMobileBanners() {
    const current=document.querySelector('body > main#contenuto');
    if (current) applyMobileBannerFocus(current);
    // Le copie mobili diventano misurabili solo dopo essere state montate.
    for (const sheet of document.querySelectorAll('.bellemo-swipe-sheet')) {
      const target=sheet.querySelector('main');
      if (target) applyMobileBannerFocus(target,sheet.dataset.bellemoFilename);
    }
  }
  window.addEventListener('resize',()=>requestAnimationFrame(refreshMobileBanners));
  mobileFocusSettings.then(settings => {
    activeMobileFocus=settings;
    refreshMobileBanners();
  });
  function pinSwipeEyebrow(state) {
    document.getElementById('bellemo-swipe-fixed-eyebrow')?.remove();
    const source = document.querySelector('body > main#contenuto .sector-banner-intro .page-intro-content > .eyebrow');
    if (!source) return;
    const box=source.getBoundingClientRect(),style=getComputedStyle(source);
    const fixed=source.cloneNode(true);
    fixed.id='bellemo-swipe-fixed-eyebrow';
    Object.assign(fixed.style,{
      top:box.top+'px',left:box.left+'px',
      fontFamily:style.fontFamily,fontSize:style.fontSize,
      fontWeight:style.fontWeight,letterSpacing:style.letterSpacing,
      lineHeight:style.lineHeight,color:style.color,
      textTransform:style.textTransform,gap:style.gap
    });
    document.body.appendChild(fixed);
    state.fixedEyebrow=fixed;
  }

  function updateNav(page) {
    const current = page.querySelector('#primary-nav');
    const live = document.querySelector('#primary-nav');
    if (!current || !live) return;
    const links = current.querySelectorAll('a');
    live.querySelectorAll('a').forEach((link, i) => {
      const targetLink = links[i];
      if (targetLink && targetLink.getAttribute('aria-current') === 'page') {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  function closeMobileMenu() {
    const button = document.querySelector('.menu-toggle');
    const nav = document.querySelector('.nav-links');
    if (!button || !nav) return;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', 'Apri il menu');
    nav.classList.remove('open');
  }

  function saveScroll() {
    const current = history.state || {};
    history.replaceState({ ...current, bellemo: true, scrollY: window.scrollY }, '');
  }

  /* BELLEMO 0063 — dicitura e triangolo invariabili tra le pagine.
     Nella 0061 la quota Home era ottenuta con CSS translate, talvolta
     frazionario, su un elemento interno a hero-copy a sua volta mosso
     mediante transform. La diversa composizione GPU alterava i pixel
     del triangolo e delle lettere durante la navigazione.
     Ora la posizione visiva identica si ottiene con top relativo, senza
     creare nuovi livelli di compositing per la dicitura; le altre parti
     del sito e la stabilizzazione del pannello rimangono inalterate. */
  function stabilizeSharedIntro() {
    const homeHero = document.querySelector('.home-page .hero');
    if (!homeHero) return;
    const eyebrow = homeHero.querySelector('.hero-copy > .eyebrow');
    const panel = homeHero.querySelector('.hero-art:not(.thematic-art)');
    if (!eyebrow || !panel) return;
    eyebrow.style.translate = '';
    eyebrow.style.top = '';
    panel.style.translate = '';
    if (window.innerWidth <= 820) return;
    const origin = homeHero.getBoundingClientRect().top;
    // Quota effettiva delle pagine interne: 69.2px di padding, -6px
    // dal top dell'eyebrow e 3px della geometria originale (66.1875px
    // nel sistema di layout Chromium). Usare la stessa subpixel-grid.
    const desired = origin + 66.1875;
    const actual = eyebrow.getBoundingClientRect().top;
    const currentTop = parseFloat(getComputedStyle(eyebrow).top) || 0;
    eyebrow.style.top = `${(currentTop + desired - actual).toFixed(5)}px`;
    // Il pannello latino conserva la quota condivisa approvata nella 0061.
    const panelOffset = origin + 119.2 - panel.getBoundingClientRect().top;
    panel.style.translate = `0px ${panelOffset.toFixed(3)}px`;
  }

  stabilizeSharedIntro();
  window.addEventListener('resize', stabilizeSharedIntro);

  // Il browser non deve ripristinare lo scroll durante la sostituzione del main.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  history.replaceState({ ...(history.state || {}), bellemo: true, scrollY: window.scrollY }, '');

  async function navigate(url, { fromHistory = false, scrollY = 0 } = {}) {
    const sequence = ++navigationSequence;
    let newPage;
    try {
      newPage = await getDocument(url);
      await prepareImages(newPage);
    } catch (error) {
      if (sequence !== navigationSequence) return;
      // Quando manca la connessione, il sito rimane un normale sito statico.
      window.location.assign(url.href);
      return;
    }
    if (sequence !== navigationSequence) return;

    if (!fromHistory) saveScroll();
    const newMain = newPage.querySelector('main#contenuto');
    const oldMain = document.querySelector('main#contenuto');
    if (!oldMain || !newMain) { window.location.assign(url.href); return; }

    // Un'unica sostituzione sincrona: body::before NON viene ricostruito.
    oldMain.replaceWith(document.importNode(newMain, true));
    // BELLEMO 0080: applicare la classe della pagina PRIMA di misurare
    // il banner. Misurarlo con le classi della pagina precedente (es. Home)
    // produce altezza e larghezza errate e puo' lasciare il cielo in vista.
    document.body.className = newPage.body.className;
    applyMobileBannerFocus(document.querySelector('body > main#contenuto'),url.pathname.split('/').pop());
    stabilizeSharedIntro();
    document.title = newPage.title;
    const sourceDescription = newPage.querySelector('meta[name="description"]');
    const liveDescription = document.querySelector('meta[name="description"]');
    if (sourceDescription && liveDescription) {
      liveDescription.content = sourceDescription.content;
    }
    updateNav(newPage);
    closeMobileMenu();

    if (!fromHistory) {
      history.pushState({ bellemo: true, scrollY: 0 }, '', url.href);
    }
    if (url.hash) {
      const identifier = decodeURIComponent(url.hash.slice(1));
      const anchor = document.getElementById(identifier);
      if (anchor) anchor.scrollIntoView({ behavior: 'instant', block: 'start' });
      else window.scrollTo({ top: 0, behavior: 'instant' });
    } else {
      window.scrollTo({ top: fromHistory ? scrollY : 0, behavior: 'instant' });
    }

    // A differenza dello swipe 0062, nessuna animazione dopo il cambio
    // ordinario di pagina. Il trascinamento 0065 gestisce la transizione
    // completa prima della sostituzione del MAIN.
    warmAllSectors();
    return true;
  }

  /* BELLEMO 0065 — trascinamento reale, annullabile e circolare.
     L'attivazione avviene SOLO sulla fotografia (non sui testi della
     pagina). Le due pagine COMPLETE sono rappresentate nel medesimo
     sistema di coordinate; la testata sticky non entra nella finestra.
     Il movimento segue il dito, senza opacity o filtri di luminosita'.
     I documenti adiacenti vengono preriscaldati (HTML e immagini).
     Per evitare schermate vuote, il movimento non parte se l'adiacente
     non e' ancora stata predisposta; resta possibile il gesto successivo.
     I gesti verticali e quelli dai bordi riservati al sistema restano
     nativi. Compatibile con la sostituzione di MAIN prevista nella 0057. */
  const mobileDragEnabled = () =>
    window.matchMedia('(max-width:820px) and (pointer:coarse)').matches;
  let drag = null, dragAnimating = false;
  const gestureEdge = 28;
  function sectorNeighbor(dx) {
    const filename = location.pathname.split('/').pop();
    const index = sectorSequence.indexOf(filename);
    if (index < 0) return null;
    const direction = dx < 0 ? 1 : -1;
    return internalPage(sectorSequence[(index + direction + sectorSequence.length) % sectorSequence.length]);
  }

  /* BELLEMO 0067 — preload COMPLETO delle sei aree (solo cellulare).
     Prima vengono caricate e decodificate entrambe le adiacenti, quindi
     le altre tre. Il documento corrente e' gia' in caricamento nativo.
     Ogni URL e ogni decodifica sono condivisi tramite le cache esistenti.
     La preparazione non blocca lo scroll, non altera la soglia dello swipe
     e non modifica le pagine desktop. Su rete lenta il gate 0066 evita
     sempre la comparsa di una fotografia non ancora pronta. */
  const warmingSectors = new Map();
  function warmSector(url) {
    const key = cacheKey(url);
    if (!warmingSectors.has(key)) {
      const work = getDocument(url).then(prepareImages);
      warmingSectors.set(key,work);
      work.catch(() => {
        if (warmingSectors.get(key) === work) warmingSectors.delete(key);
      });
    }
    return warmingSectors.get(key);
  }
  function warmAllSectors() {
    if (!mobileDragEnabled()) return;
    const current = location.pathname.split('/').pop();
    const index = sectorSequence.indexOf(current);
    if (index < 0) return;
    const next = sectorSequence[(index+1)%sectorSequence.length];
    const previous = sectorSequence[(index-1+sectorSequence.length)%sectorSequence.length];
    const priority = [next,previous];
    const remaining = sectorSequence.filter(filename =>
      filename !== current && !priority.includes(filename));
    // Il caricamento delle altre aree parte quando entrambe le vicine
    // sono state tentate, così la banda serve prima lo swipe immediato.
    Promise.allSettled(priority.map(filename => {
      const url = internalPage(filename);
      return url ? warmSector(url) : Promise.resolve();
    })).then(() => {
      if (!mobileDragEnabled()) return;
      for (const filename of remaining) {
        const url = internalPage(filename);
        if (url) warmSector(url).catch(() => {});
      }
    });
  }
  warmAllSectors();

  function cleanDrag(state) {
    if (!state) return;
    state.aborted = true;
    if (state.pendingStage) state.pendingStage.remove();
    if (state.stage) state.stage.remove();
    if (state.fixedEyebrow) state.fixedEyebrow.remove();
    document.documentElement.classList.remove('bellemo-swipe-active');
    if (drag === state) drag = null;
    dragAnimating = false;
  }

  async function createDragStage(state, page, serial) {
    if (!drag || drag !== state || state.aborted || state.stage) return;
    const oldMain = document.querySelector('body > main#contenuto');
    const header = document.querySelector('.site-header');
    if (!oldMain || !header) return;
    const nextMain = page.querySelector('main#contenuto');
    if (!nextMain) return;
    const headerBottom = Math.max(0, header.getBoundingClientRect().bottom);
    const offsetTop = oldMain.getBoundingClientRect().top - headerBottom;
    const viewportWidth = document.documentElement.clientWidth;
    const stage = document.createElement('div');
    stage.className = 'bellemo-swipe-stage';
    stage.style.top = headerBottom + 'px';
    // Precompone FUORI SCHERMO senza oscurare la pagina in uso.
    // Sara' mostrato istantaneamente (senza fade) solo a decodifica finita.
    stage.style.opacity = '0';
    stage.setAttribute('aria-hidden','true');
    const track = document.createElement('div');
    track.className = 'bellemo-swipe-track';
    stage.appendChild(track);
    const makeSheet = (node, direction) => {
      const sheet = document.createElement('div');
      sheet.className = 'bellemo-swipe-sheet';
      sheet.style.left = (direction * viewportWidth) + 'px';
      sheet.style.top = offsetTop + 'px';
      sheet.dataset.bellemoFilename = direction === 0 ? location.pathname.split('/').pop() : state.url.pathname.split('/').pop();
      const main = node.cloneNode(true);
      main.removeAttribute('id');
      const sectorFilename = direction === 0
        ? location.pathname.split('/').pop()
        : state.url.pathname.split('/').pop();
      applyMobileBannerFocus(main,sectorFilename);
      // La SOURCE dinamica di PICTURE potrebbe venire rivalutata dopo il
      // decode, rivelando per un istante il fondo grigio. Nelle copie di
      // scena si fissa invece l'URL mobile scelto, senza toccare i documenti.
      for (const picture of main.querySelectorAll('picture.bellemo-responsive-banner')) {
        const img=picture.querySelector('img.sector-banner-photo');
        if (!img) continue;
        const photo=effectiveImageSource(img);
        picture.querySelectorAll('source').forEach(source=>source.remove());
        img.removeAttribute('srcset');
        img.setAttribute('src',new URL(photo,document.baseURI).href);
        img.loading='eager';
        img.decoding='sync';
      }
      sheet.appendChild(main);
      const footer = document.querySelector('body > footer.site-footer');
      if (footer) sheet.appendChild(footer.cloneNode(true));
      track.appendChild(sheet);
      return sheet;
    };
    await mobileFocusSettings;
    if (state.aborted || state.serial !== serial || drag !== state) return;
    makeSheet(oldMain,0);
    makeSheet(document.importNode(nextMain,true),state.direction);
    document.body.appendChild(stage);
    state.pendingStage = stage;
    // Anche le IMG delle due copie EFFETTIVAMENTE INSERITE nel DOM devono
    // avere i pixel pronti. Non basta il decode() di un Image esterno.
    const banners = Array.from(stage.querySelectorAll('.sector-banner-photo'));
    if (banners.length !== 2) {stage.remove();state.pendingStage=null;return;}
    try {
      await Promise.all(banners.map(img => {
        img.loading = 'eager';
        img.decoding = 'sync';
        return img.decode().then(() => {
          if (!img.complete || !img.naturalWidth || !img.currentSrc)
            throw new Error('Panoramica non pronta');
        });
      }));
    } catch (_) {
      // Mai mostrare il colore di fondo al posto della foto mancante.
      stage.remove();state.pendingStage=null;return;
    }
    if (state.aborted || drag !== state || serial !== state.serial ||
        state.pendingStage !== stage) {
      stage.remove();return;
    }
    // Le copie ora sono nel DOM e hanno dimensioni reali: la stessa
    // inquadratura con limiti di copertura va calcolata prima del paint.
    for (const img of banners) {
      if (!positionMobileBanner(img)) {stage.remove();state.pendingStage=null;return;}
    }
    // Due frame consentono di comporre entrambe le fotografie nella stessa
    // superficie prima dell'esposizione. Non e' una transizione di opacita'.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (state.aborted || drag !== state || serial !== state.serial ||
        state.pendingStage !== stage) {
      stage.remove();return;
    }
    track.style.transform = `translate3d(${state.dx}px,0,0)`;
    state.stage=stage;state.track=track;state.width=viewportWidth;
    state.pendingStage=null;
    pinSwipeEyebrow(state);
    stage.style.opacity = '1';
    document.documentElement.classList.add('bellemo-swipe-active');
    state.ready = true;
  }

  function moveDrag(dx) {
    const state = drag;
    if (!state || state.aborted) return;
    const direction = dx < 0 ? 1 : -1;
    state.dx = dx;
    if (state.direction !== direction) {
      // Invertendo il dito la pagina adiacente cambia; se l'altra
      // pagina non e' pronta non viene mai mostrata un'area bianca.
      state.direction=direction;
      state.url=sectorNeighbor(dx);
      state.ready=false;
      if (state.stage) {state.stage.remove();state.stage=null;state.track=null;}
      if (state.fixedEyebrow) {state.fixedEyebrow.remove();state.fixedEyebrow=null;}
      if (state.pendingStage) {state.pendingStage.remove();state.pendingStage=null;}
      const serial=++state.serial;
      const target=state.url;
      if (!target) return;
      getDocument(target).then(page=>prepareImages(page).then(()=>page)).then(page=>{
        if (drag!==state || state.aborted || serial!==state.serial) return;
        state.page=page;
        if (state.axis==='horizontal') createDragStage(state,page,serial);
      }).catch(()=>{});
      return;
    }
    if (state.stage) state.track.style.transform = `translate3d(${dx}px,0,0)`;
  }

  document.addEventListener('touchstart', event => {
    if (dragAnimating || !mobileDragEnabled() || event.touches.length!==1) return;
    const target=event.target;
    if (!(target instanceof Element) ||
        !target.closest('.sector-detail .sector-banner') ||
        target.closest('a,button,input,select,textarea,[contenteditable]')) return;
    const t=event.touches[0];
    if (t.clientX<gestureEdge || t.clientX>innerWidth-gestureEdge) return;
    if (!sectorNeighbor(-1)) return;
    drag={id:t.identifier,x:t.clientX,y:t.clientY,dx:0,axis:'pending',
      startedAt:performance.now(),lastX:t.clientX,lastAt:performance.now(),
      velocity:0,direction:0,ready:false,stage:null,pendingStage:null,serial:0,aborted:false};
  },{passive:true});

  document.addEventListener('touchmove', event => {
    const state=drag;
    if (!state || state.aborted || !mobileDragEnabled()) return;
    if (event.touches.length!==1) {state.aborted=true;cleanDrag(state);return;}
    const touch=Array.from(event.touches).find(t=>t.identifier===state.id);
    if (!touch) return;
    const dx=touch.clientX-state.x,dy=touch.clientY-state.y;
    if (state.axis==='pending') {
      if (Math.max(Math.abs(dx),Math.abs(dy))<9) return;
      if (Math.abs(dy)>Math.abs(dx)*0.8) {state.axis='vertical';return;}
      if (Math.abs(dx)<Math.abs(dy)*1.3) return;
      state.axis='horizontal';
    }
    if (state.axis!=='horizontal') return;
    if (event.cancelable) event.preventDefault();
    const now=performance.now(),dt=now-state.lastAt;
    if (dt>0) state.velocity=(touch.clientX-state.lastX)/dt;
    state.lastX=touch.clientX;state.lastAt=now;
    moveDrag(dx);
  },{passive:false});

  async function animateDrag(state, endpoint, ms) {
    if (!state.stage) return;
    const track=state.track;
    track.style.transition=`transform ${ms}ms cubic-bezier(.22,1,.36,1)`;
    // Forza una lettura prima di aggiornare transform: garantisce che
    // il browser veda una transizione dall'ultima quota trascinata.
    void track.offsetWidth;
    track.style.transform=`translate3d(${endpoint}px,0,0)`;
    await new Promise(resolve => setTimeout(resolve,ms+35));
  }

  document.addEventListener('touchend',async event => {
    const state=drag;
    if (!state || event.touches.length) return;
    const touch=Array.from(event.changedTouches).find(t=>t.identifier===state.id);
    if (!touch) return;
    drag=null;
    if (state.axis!=='horizontal' || !state.stage || !state.ready) {
      cleanDrag(state);return;
    }
    dragAnimating=true;
    const w=state.width;
    const committed=Math.abs(state.dx)>=w*.35 ||
      (Math.abs(state.dx)>=42 && Math.abs(state.velocity)>=.55 &&
       Math.sign(state.velocity)===Math.sign(state.dx));
    const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!committed) {
      await animateDrag(state,0,reduce?0:210);
      cleanDrag(state);return;
    }
    await animateDrag(state,-state.direction*w,reduce?0:230);
    if (state.url) {
      const switched = await navigate(state.url);
      if (!switched) { cleanDrag(state); return; }
    }
    /* BELLEMO 0069 — Passaggio senza bagliore alla pagina definitiva.
       Il nuovo MAIN, pur montato e con immagini precaricate, era ancora
       visibility:hidden finche' esisteva la scena di trascinamento.
       La rimozione della scena scopriva quindi una pagina che il browser
       non aveva mai avuto modo di dipingere: possibile frame bianco.
       PRIMA rendiamo dipingibile il nuovo MAIN, tenendolo coperto dalla
       scena opaca gia' arrivata a destinazione. Attendiamo la decode()
       delle IMG realmente montate e due cicli di paint. SOLTANTO DOPO
       eliminiamo la scena. Non cambiano gesture, tempi o soglie. */
    document.documentElement.classList.remove('bellemo-swipe-active');
    const liveMain = document.querySelector('body > main#contenuto');
    if (liveMain) {
      const photos = Array.from(liveMain.querySelectorAll('img.sector-banner-photo'));
      await Promise.all(photos.map(async img => {
        try {
          await img.decode();
          if (!img.naturalWidth) throw new Error('Panoramica non pronta');
        } catch (error) {
          // Restare sulla scena gia' pronta non e' una soluzione durevole.
          // La pagina e' comunque montata; una decodifica fallita non deve
          // bloccare indefinitamente la navigazione o lasciare overlay attivi.
          console.error('Impossibile completare la decodifica della fotografia:',error);
        }
      }));
    }
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    cleanDrag(state);
  },{passive:true});

  document.addEventListener('touchcancel',()=>{
    if (drag) {drag.aborted=true;cleanDrag(drag);}
  },{passive:true});
  window.addEventListener('resize',()=>{if(drag) cleanDrag(drag);});

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 ||
        event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest('a[href]');
    if (!anchor || anchor.hasAttribute('download') ||
        (anchor.target && anchor.target !== '_self')) return;
    const url = internalPage(anchor.href);
    if (!url) return;
    if (url.pathname === location.pathname && url.search === location.search) {
      // Stessa pagina: nessun reload neppure cliccando sulla voce gia' attiva.
      // I link con ancora continuano invece a usare lo scorrimento nativo.
      if (url.hash) return;
      event.preventDefault();
      closeMobileMenu();
      window.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }
    event.preventDefault();
    navigate(url);
  });

  document.addEventListener('pointerover', event => {
    const anchor = event.target.closest('a[href]');
    if (!anchor) return;
    const url = internalPage(anchor.href);
    if (url && cacheKey(url) !== cacheKey(location)) getDocument(url).catch(() => {});
  });
  document.addEventListener('focusin', event => {
    const anchor = event.target.closest('a[href]');
    if (!anchor) return;
    const url = internalPage(anchor.href);
    if (url && cacheKey(url) !== cacheKey(location)) getDocument(url).catch(() => {});
  });

  window.addEventListener('popstate', event => {
    const url = internalPage(location.href);
    if (url) navigate(url, { fromHistory: true, scrollY: event.state?.scrollY || 0 });
  });

  // Memorizza lo scorrimento dell'entry corrente per Indietro e Avanti.
  let scrollTimer = 0;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const state = history.state || {};
      history.replaceState({ ...state, bellemo: true, scrollY: window.scrollY }, '');
    }, 120);
  }, { passive: true });
})();
