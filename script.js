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
    // BELLEMO 0088 — aggiorna la cache dei due vicini del circuito principale.
    warmPrimaryNeighbors();
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
  /* BELLEMO 0087 — profilo touch a sensibilita' elevata: valori di
     progetto, NON parametri ufficiali di X/Twitter o TikTok (non pubblici).
     Prima separiamo intenzione orizzontale da scroll verticale; poi
     riconosciamo flick brevi o trascinamenti decisi. Geometria e transizione
     delle sei pagine restano esattamente quelle della versione 0086. */
  const swipeStartPx = 5;
  const swipeCommitRatio = .14;
  const swipeFlickMinPx = 18;
  const swipeFlickVelocity = .24;
  const swipeReadyWaitMs = 700;
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
      state.preparation=getDocument(target)
        .then(page=>prepareImages(page).then(()=>page))
        .then(page=>{
          if (drag!==state || state.aborted || serial!==state.serial) return;
          state.page=page;
          if (state.axis==='horizontal') return createDragStage(state,page,serial);
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
    const startedAt=performance.now();
    drag={id:t.identifier,x:t.clientX,y:t.clientY,dx:0,axis:'pending',
      startedAt,lastX:t.clientX,lastAt:startedAt,
      samples:[{x:t.clientX,t:startedAt}],ended:false,preparation:null,
      velocity:0,direction:0,ready:false,stage:null,pendingStage:null,serial:0,aborted:false};
  },{passive:true});

  document.addEventListener('touchmove', event => {
    const state=drag;
    if (!state || state.aborted || state.ended || !mobileDragEnabled()) return;
    if (event.touches.length!==1) {state.aborted=true;cleanDrag(state);return;}
    const touch=Array.from(event.touches).find(t=>t.identifier===state.id);
    if (!touch) return;
    const dx=touch.clientX-state.x,dy=touch.clientY-state.y;
    if (state.axis==='pending') {
      if (Math.max(Math.abs(dx),Math.abs(dy))<swipeStartPx) return;
      if (Math.abs(dy)>Math.abs(dx)*1.15) {state.axis='vertical';return;}
      if (Math.abs(dx)<Math.abs(dy)*1.15) return;
      state.axis='horizontal';
    }
    if (state.axis!=='horizontal') return;
    if (event.cancelable) event.preventDefault();
    const now=performance.now(),dt=now-state.lastAt;
    if (dt>0) state.velocity=(touch.clientX-state.lastX)/dt;
    state.lastX=touch.clientX;state.lastAt=now;
    state.samples.push({x:touch.clientX,t:now});
    while (state.samples.length>2 && state.samples[1].t<now-125)
      state.samples.shift();
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
    if (state.ended) return;
    state.ended=true;
    // BELLEMO 0087 — gesto molto rapido: alcuni browser inviano il touchend
    // prima di qualsiasi touchmove oltre il piccolo slop iniziale. In quel
    // caso riconosciamo la direzione sul punto finale, SOLO se orizzontale;
    // non intercettiamo tocchi fermi, scroll verticali o gesti diagonali.
    const finalDx=touch.clientX-state.x;
    const finalDy=touch.clientY-state.y;
    if (state.axis==='pending' && Math.abs(finalDx)>=swipeStartPx &&
        Math.abs(finalDx)>=Math.abs(finalDy)*1.15) {
      state.axis='horizontal';
    }
    if (state.axis!=='horizontal') {cleanDrag(state);return;}
    // Il punto di rilascio decide il segno effettivo anche quando l'ultimo
    // movimento non e' stato inviato come touchmove. Questo gestisce anche
    // una rapida inversione del dito evitando di aprire l'area sbagliata.
    state.dx=finalDx;
    if (state.dx && state.direction !== (state.dx<0 ? 1 : -1))
      moveDrag(state.dx);
    const now=performance.now();
    const samples=state.samples.filter(point=>point.t>=now-130);
    const first=samples[0] || {x:state.x,t:state.startedAt};
    const elapsed=Math.max(1,now-first.t);
    const velocity=(touch.clientX-first.x)/elapsed;
    const w=document.documentElement.clientWidth;
    const committed=Math.abs(state.dx)>=w*swipeCommitRatio ||
      (Math.abs(state.dx)>=swipeFlickMinPx &&
       Math.abs(velocity)>=swipeFlickVelocity &&
       Math.sign(velocity)===Math.sign(state.dx));
    const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!committed) {
      drag=null;
      if (state.stage) await animateDrag(state,0,reduce?0:210);
      cleanDrag(state);return;
    }
    dragAnimating=true;
    // Il dito puo' essere rilasciato PRIMA delle due rAF necessarie a
    // comporre le fotografie. Manteniamo lo stato fino alla fine del gate.
    if (!state.ready && state.preparation) {
      await Promise.race([
        state.preparation,
        new Promise(resolve=>setTimeout(resolve,swipeReadyWaitMs))
      ]);
    }
    if (state.aborted) {cleanDrag(state);return;}
    if (!state.stage || !state.ready) {
      // Su rete molto lenta non perdere lo swipe e non mostrare foto vuote.
      const target=state.url;
      cleanDrag(state);
      if (target) await navigate(target);
      return;
    }
    // Il gesto completato e' indipendente da ulteriori touchmove.
    drag=null;
    state.track.style.transform=`translate3d(${state.dx}px,0,0)`;
    await animateDrag(state,-state.direction*state.width,reduce?0:230);
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

  /* BELLEMO 0089 — SWIPE CIRCOLARE SU TUTTA L'ALTEZZA DELLE 11 PAGINE.
     Il circuito principale 0088 resta invariato; il circuito dei sei settori
     opera anche su MAIN e FOOTER dopo lo scorrimento verticale. Sulle foto
     panoramiche resta ESCLUSIVAMENTE il trascinamento animato 0087, con i
     suoi gestori, limiti e centrature fotografici integralmente invariati.
     Su tutti gli altri contenuti vale il gesto piu' prudente della 0088:
     link e pulsanti esclusi, prevalenza orizzontale, bordi Android liberi.
     Nessuna nuova animazione: la pagina e' cambiata dal router 0057. */
  const primarySequence = [
    'index.html', 'profilo.html', 'settori.html', 'metodo.html', 'contatti.html'
  ];
  let primaryTouch = null;
  let primaryNavigating = false;
  const primaryDirectionRatio = 1.35;

  function primaryPageName() {
    return location.pathname.split('/').pop() || 'index.html';
  }
  function pageWideNeighbor(dx) {
    const filename=primaryPageName();
    // Il circuito specialistico resta indipendente da quello principale.
    if (sectorSequence.includes(filename)) return sectorNeighbor(dx);
    const index=primarySequence.indexOf(filename);
    if (index < 0) return null;
    const step=dx < 0 ? 1 : -1;
    return internalPage(primarySequence[(index+step+primarySequence.length)%primarySequence.length]);
  }
  // HTML dei soli due vicini: nessun download delle grandi panoramiche e
  // nessuna interferenza con il pre-caricamento delle sei aree fotografiche.
  function warmPrimaryNeighbors() {
    if (!mobileDragEnabled()) return;
    const i=primarySequence.indexOf(primaryPageName());
    if (i < 0) return;
    for (const k of [(i+1)%primarySequence.length,
                     (i-1+primarySequence.length)%primarySequence.length]) {
      const url=internalPage(primarySequence[k]);
      if (url) getDocument(url).catch(()=>{});
    }
  }
  warmPrimaryNeighbors();

  function clearPrimaryTouch() { primaryTouch=null; }
  document.addEventListener('touchstart',event=>{
    // Un secondo dito interrompe subito la selezione del gesto precedente.
    if (event.touches.length!==1) {clearPrimaryTouch();return;}
    if (!mobileDragEnabled() || dragAnimating || primaryNavigating || drag ||
        (!primarySequence.includes(primaryPageName()) &&
         !sectorSequence.includes(primaryPageName())))
      return;
    const target=event.target;
    if (!(target instanceof Element) ||
        !target.closest('body > main#contenuto, body > footer.site-footer') ||
        // Non duplicare MAI lo swipe fotografico con trascinamento 0087.
        (sectorSequence.includes(primaryPageName()) &&
         target.closest('.sector-detail .sector-banner')) ||
        target.closest('a,button,input,select,textarea,option,label,summary,iframe,video,audio,[contenteditable],[role="button"],[role="link"],.bellemo-swipe-stage') ||
        document.querySelector('.nav-links.open') ||
        (window.getSelection() && !window.getSelection().isCollapsed)) return;
    const t=event.touches[0];
    // Le zone laterali di Android rimangono riservate al gesto Indietro.
    if (t.clientX<gestureEdge || t.clientX>innerWidth-gestureEdge) return;
    const now=performance.now();
    primaryTouch={id:t.identifier,x:t.clientX,y:t.clientY,
      axis:'pending',startedAt:now,scrollY:window.scrollY,
      samples:[{x:t.clientX,t:now}]};
  },{passive:true});

  document.addEventListener('touchmove',event=>{
    const state=primaryTouch;
    if (!state) return;
    if (event.touches.length!==1 || !mobileDragEnabled() ||
        Math.abs(window.scrollY-state.scrollY)>4) {clearPrimaryTouch();return;}
    const t=Array.from(event.touches).find(item=>item.identifier===state.id);
    if (!t) return;
    const dx=t.clientX-state.x,dy=t.clientY-state.y;
    if (state.axis==='pending') {
      if (Math.max(Math.abs(dx),Math.abs(dy))<swipeStartPx) return;
      if (Math.abs(dy)>Math.abs(dx)*1.15) {
        state.axis='vertical';return;
      }
      if (Math.abs(dx)<Math.abs(dy)*primaryDirectionRatio) return;
      state.axis='horizontal';
    }
    if (state.axis!=='horizontal') return;
    // Solo dopo aver riconosciuto l'intenzione orizzontale impediamo il
    // movimento verticale. Lo scroll normale resta sempre disponibile.
    if (event.cancelable) event.preventDefault();
    const now=performance.now();
    state.samples.push({x:t.clientX,t:now});
    while (state.samples.length>2 && state.samples[1].t<now-125)
      state.samples.shift();
    // Carica il documento da aprire mentre il dito e' ancora sullo schermo.
    const neighbor=pageWideNeighbor(dx);
    if (neighbor) getDocument(neighbor).catch(()=>{});
  },{passive:false});

  document.addEventListener('touchend',event=>{
    const state=primaryTouch;
    if (!state || event.touches.length) return;
    const t=Array.from(event.changedTouches).find(item=>item.identifier===state.id);
    clearPrimaryTouch();
    if (!t || !mobileDragEnabled() || primaryNavigating ||
        Math.abs(window.scrollY-state.scrollY)>4 || state.axis==='vertical') return;
    const dx=t.clientX-state.x,dy=t.clientY-state.y;
    if (Math.abs(dx)<swipeStartPx ||
        Math.abs(dx)<Math.abs(dy)*primaryDirectionRatio) return;
    // Riconosce anche il flick in cui il browser emette touchend prima di
    // avere inviato un touchmove qualificante, come nella 0087.
    const now=performance.now();
    const samples=state.samples.filter(point=>point.t>=now-130);
    const first=samples[0] || {x:state.x,t:state.startedAt};
    const velocity=(t.clientX-first.x)/Math.max(1,now-first.t);
    const committed=Math.abs(dx)>=document.documentElement.clientWidth*swipeCommitRatio ||
      (Math.abs(dx)>=swipeFlickMinPx &&
       Math.abs(velocity)>=swipeFlickVelocity &&
       Math.sign(velocity)===Math.sign(dx));
    if (!committed) return;
    const destination=pageWideNeighbor(dx);
    if (!destination) return;
    primaryNavigating=true;
    // Lo scroll torna all'inizio della pagina nuova; il vecchio scroll
    // resta nella cronologia per l'eventuale comando Indietro del browser.
    Promise.resolve(navigate(destination)).catch(error=>{
      console.error('Navigazione gestuale Bellemo:',error);
    }).finally(()=>{primaryNavigating=false;});
  },{passive:true});

  document.addEventListener('touchcancel',clearPrimaryTouch,{passive:true});
  window.addEventListener('resize',clearPrimaryTouch);

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
