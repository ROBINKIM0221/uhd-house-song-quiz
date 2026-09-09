// 오프라인 캐시. 음원을 교체 배포하면 CACHE_VERSION을 올린다.
const CACHE_VERSION = 'uhd-quiz-v1';

// 음원은 여기 넣지 않는다. 아직 파일이 없어서 사전 캐시에 넣으면
// 설치가 통째로 실패한다. 음원은 요청이 들어올 때 캐시에 담는다.
const PRECACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/audio.js',
  './js/quiz.js',
  './js/songs.js',
  './manifest.webmanifest',
  './icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          // 음원처럼 나중에 들어온 자산도 한 번 받으면 캐시에 담는다.
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
    }),
  );
});
