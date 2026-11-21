/* Service worker: guarda la página y los casos para usarlos sin internet.
   Con internet siempre intenta traer la versión más nueva; sin internet usa lo guardado.
   Cambia VERSION cuando publiques cambios para limpiar lo viejo. */
const VERSION = 'sc-v2';
const BASE = ['./', 'index.html', 'css/estilos.css', 'js/monitor.js', 'js/motor.js', 'js/app.js',
  'manifest.webmanifest', 'iconos/icono-180.png', 'iconos/icono-192.png', 'iconos/icono-512.png', 'data/indice.json'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(BASE);
    try {
      const r = await fetch('data/indice.json', { cache: 'no-store' });
      const idx = await r.json();
      const extra = [];
      idx.casos.forEach((x) => { extra.push('data/' + x.archivo); if (x.imagen) extra.push('imagenes/pacientes/' + x.id + '.png'); });
      await c.addAll(extra);
    } catch (err) { /* se completará en la próxima visita */ }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const claves = await caches.keys();
    await Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    try {
      const r = await fetch(req);
      if (r && r.ok) c.put(req, r.clone());
      return r;
    } catch (err) {
      const guardado = await c.match(req, { ignoreSearch: true });
      if (guardado) return guardado;
      if (req.mode === 'navigate') { const inicio = await c.match('index.html'); if (inicio) return inicio; }
      throw err;
    }
  })());
});
