'use strict';

/* Service Worker «Дашиной Игры»: игра целиком работает офлайн.
   При любом изменении файлов игры увеличьте версию кэша — иначе
   у игроков останется старая копия. */

const CACHE = 'dasha-v2';
// Начала имён всех версий кэша этой игры, включая прежнее название (hue-v1)
const PREFIXES = ['dasha-', 'hue-'];

// Пути относительные: относятся к папке sw.js (например, /имя-репозитория/ на GitHub Pages)
const FILES = [
  './',
  './index.html',
  './style.css',
  './game.js',
  './manifest.json',
  './icon-180.png',
  './icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    // cache: 'reload' — мимо HTTP-кэша браузера: GitHub Pages разрешает хранить
    // файлы до 10 минут, и без этого новая версия могла бы закэшировать старые
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    // Удаляем только свои старые версии: все проекты на имя.github.io живут
    // на одном домене и делят хранилище кэшей
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE && PREFIXES.some((p) => k.startsWith(p))).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Сначала кэш, потом сеть
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => {
          // Офлайн и файла нет в кэше: для переходов отдаём саму игру
          if (req.mode === 'navigate') {
            return caches.match('./index.html').then((page) => page || Response.error());
          }
          return Response.error();
        });
    })
  );
});
