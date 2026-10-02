const CACHE = "rapportini-cache-v5";
const ASSETS = [
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-192-maskable.png",
  "./icon-512-maskable.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => cached || caches.match("./index.html"))
      )
  );
});

/* ---------- Promemoria giornaliero presenza (best-effort, ad app chiusa) ---------- */
const FIREBASE_PROJECT_ID = "rapportini-lavori-elettrici";
const FIREBASE_API_KEY = "AIzaSyBbnlUSS2Im_93Wi7IhxQMKwy-OU7if2EQ";
const META_CACHE = "rapportini-meta";

function todaySW() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function presenzaIdSW(date, nome) {
  return date + "__" + nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-");
}
async function getPresenzaReminderInfo() {
  try {
    const cache = await caches.open(META_CACHE);
    const res = await cache.match("/__presenza-reminder-info");
    if (!res) return null;
    return await res.json();
  } catch (e) { return null; }
}
async function presenzaMarkedToday(nome) {
  const docId = presenzaIdSW(todaySW(), nome);
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/presenze/${encodeURIComponent(docId)}?key=${FIREBASE_API_KEY}`;
  try {
    const res = await fetch(url);
    return res.ok;
  } catch (e) { return false; }
}
async function checkPresenzaReminderInBackground() {
  const info = await getPresenzaReminderInfo();
  if (!info || !info.nome) return;
  const now = new Date();
  const hhmm = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  if (hhmm < (info.ora || "18:00")) return;
  const marked = await presenzaMarkedToday(info.nome);
  if (marked) return;
  await self.registration.showNotification("Presenze", {
    body: "Promemoria: non hai ancora segnato la tua presenza di oggi.",
    icon: "icon-192.png",
    badge: "icon-192.png"
  });
}
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "presenza-reminder") {
    event.waitUntil(checkPresenzaReminderInBackground());
  }
});
