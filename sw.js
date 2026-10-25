/* Kelime Avcısı service worker: uygulamanın kendisini çevrimdışı açılabilir tutar.
   Önce ağdan dener (güncellemeler hemen gelsin), ağ yoksa önbellekten verir.
   Sözlük/çeviri istekleri ve videolar hiç önbelleğe alınmaz. */
const CACHE = 'kelime-avcisi-v5';
const SHELL = [
  './', './index.html', './app.js', './style.css', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
  './img/nasil-1-izle.webp', './img/nasil-2-dokun.webp', './img/nasil-3-yakala.webp', './img/nasil-4-tekrar.webp'
];

self.addEventListener('install', e => {
  // GitHub Pages dosyaları 10 dk önbellekli gönderir; kurulumda tarayıcı önbelleğini atla ki eski sürüm kaydedilmesin
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || req.headers.has('range') || url.pathname.includes('/videos/')) return;
  e.respondWith(
    // no-cache: tarayıcı önbelleği her seferinde sunucuya sorulsun (değişmediyse 304, yeni sürüm push'tan hemen sonra gelir).
    // Sayfa açılışına dokunma: yeni Request yönlendirmeyi kendisi izler, Chrome bu yanıtı sayfa için reddeder
    fetch(req.mode === 'navigate' ? req : new Request(req.url, { cache: 'no-cache' }))
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
