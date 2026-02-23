// ============================================================
// STOCKPRO — SERVICE WORKER (PWA)
// File: sw.js — letakkan di root folder
// ============================================================

const CACHE_NAME = 'stockpro-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  // CDN assets yang sering dipakai
  'https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,600;0,700;1,600&family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
];

// ============================================================
// INSTALL — cache semua static assets
// ============================================================
self.addEventListener('install', event => {
  console.log('[SW] Installing StockPro Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { mode: 'cors' })));
    }).catch(err => console.warn('[SW] Cache install partial fail:', err))
  );
  self.skipWaiting();
});

// ============================================================
// ACTIVATE — hapus cache lama
// ============================================================
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => {
        console.log('[SW] Deleting old cache:', k);
        return caches.delete(k);
      }))
    )
  );
  self.clients.claim();
});

// ============================================================
// FETCH — strategi cache
// ============================================================
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls — Network First (selalu coba online dulu)
  if (url.pathname.startsWith('/api') || url.hostname.includes('supabase') || url.hostname.includes('railway')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Static assets — Cache First
  if (request.destination === 'style' || request.destination === 'script' || request.destination === 'font') {
    event.respondWith(cacheFirst(request));
    return;
  }

  // HTML — Network First dengan fallback offline
  if (request.destination === 'document') {
    event.respondWith(networkFirstWithOffline(request));
    return;
  }

  // Default — Stale While Revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// ============================================================
// STRATEGI CACHE
// ============================================================

// Cache First — cepat, gunakan cache jika ada
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

// Network First — gunakan jaringan, fallback ke cache
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ error: 'Tidak ada koneksi internet' }), {
      status: 503, headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Network First + offline page fallback
async function networkFirstWithOffline(request) {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match(request) || await caches.match('/index.html');
    return cached || new Response(offlinePage(), { headers: { 'Content-Type': 'text/html' } });
  }
}

// Stale While Revalidate
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(c => c.put(request, response.clone()));
    return response;
  }).catch(() => null);
  return cached || await fetchPromise;
}

// ============================================================
// OFFLINE PAGE
// ============================================================
function offlinePage() {
  return `<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>StockPro — Offline</title>
<style>body{font-family:'DM Sans',sans-serif;background:#004F35;color:white;display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:16px;text-align:center;padding:20px;}
.icon{font-size:64px;}.title{font-size:24px;font-weight:700;}.sub{font-size:14px;opacity:.7;max-width:280px;line-height:1.5;}
.btn{background:white;color:#004F35;padding:12px 28px;border-radius:50px;border:none;font-weight:700;font-size:14px;cursor:pointer;margin-top:8px;}
</style></head>
<body>
<div class="icon">📡</div>
<div class="title">Tidak Ada Koneksi</div>
<div class="sub">StockPro membutuhkan koneksi internet untuk memuat data. Periksa koneksi Anda dan coba lagi.</div>
<button class="btn" onclick="location.reload()">🔄 Coba Lagi</button>
</body></html>`;
}

// ============================================================
// PUSH NOTIFICATION (opsional — stok kritis)
// ============================================================
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'StockPro', {
      body: data.body || 'Ada notifikasi baru',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      tag: data.tag || 'stockpro-notif',
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
