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
