/* =========================================================================
   SERVICE WORKER — permite abrir la app sin conexión
   =========================================================================
   La primera vez que se abre la app CON señal, este archivo guarda una copia
   de todo lo necesario (el código de la app, las fuentes, el SDK de Firebase,
   Leaflet para el mapa) en el almacenamiento del navegador. Las siguientes
   veces, si no hay señal, la app se abre igual usando esa copia guardada.

   Importante: esto no reemplaza tener señal en algún momento — la primera
   apertura de la app (o después de cada actualización de la app) sí necesita
   conexión al menos una vez para poder guardar la copia actualizada.
   ========================================================================= */

const CACHE_VERSION = "v3";
const CACHE_NAME = `bitacora-maquinaria-${CACHE_VERSION}`;

// Archivos propios de la app + las URLs exactas del SDK "compat" de Firebase
// (archivos únicos y autocontenidos, sin dependencias internas ocultas —
// por eso se puede confiar en que quedan completos con solo listarlos aquí).
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-180.png",
  "./favicon-32.png",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage-compat.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            // Si algo no se puede guardar de antemano (ej. sin señal en ese
            // instante), no rompemos la instalación completa del service worker.
            console.warn("No se pudo pre-cachear:", url, err);
          })
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // La verificación rápida de conectividad ("¿hay señal de verdad?") no debe
  // pasar por esta lógica de caché — necesita hablar con la red directo, sin
  // intermediarios, para poder fallar rápido y de forma confiable cuando no
  // hay señal. Si no llamamos a respondWith(), el navegador la deja pasar tal
  // cual, como si este service worker no existiera para esa petición puntual.
  if (req.url.includes("generate_204")) return;

  // Al ABRIR la app (navegación): intenta red primero (así siempre se ve la
  // versión más reciente si hay señal), y si falla, usa la copia guardada.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copia));
          return res;
        })
        .catch(() => caches.match(req).then((res) => res || caches.match("./index.html")))
    );
    return;
  }

  // Todo lo demás (CSS, JS, fuentes, íconos, SDK de Firebase, mapa): caché
  // primero (carga instantánea y funciona sin señal), y si no está guardado
  // todavía, se busca en la red y se guarda para la próxima vez.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === "opaque")) {
            const copia = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copia));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
