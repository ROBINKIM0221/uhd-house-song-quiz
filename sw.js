// 오프라인 캐시.
//
// 네트워크 우선(network-first) 전략을 쓴다. 인터넷이 되면 항상 최신 파일을
// 받고, 안 되면 마지막으로 성공한 응답을 캐시에서 꺼낸다.
//
// 캐시 우선으로 만들었더니 배포한 수정이 화면에 안 잡히는 문제가 있었다.
// 새 워커가 활성화된 '다음' 새로고침에야 반영돼서, 한 번만 새로고침한
// 사람은 계속 옛날 화면을 봤다. 부스 준비 중에 문구 하나 고칠 때마다
// 이걸 겪을 수는 없다.
const CACHE_VERSION = 'uhd-quiz-v5';

// 경기장 와이파이가 죽지는 않았는데 느리기만 한 경우가 제일 곤란하다.
// 이 시간을 넘기면 더 기다리지 않고 캐시로 넘어간다.
const NETWORK_TIMEOUT_MS = 4000;

// 음원은 여기 넣지 않는다. 아직 파일이 없어서 사전 캐시에 넣으면
// 설치가 통째로 실패한다. 음원은 요청이 들어올 때 캐시에 담긴다.
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
  './img/emblem.png',
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

function fetchWithTimeout(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('network timeout')), NETWORK_TIMEOUT_MS);
    fetch(request).then(
      (response) => {
        clearTimeout(timer);
        resolve(response);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);

  try {
    const response = await fetchWithTimeout(request);
    // 같은 출처의 정상 응답만 담는다. 음원처럼 나중에 들어온 파일도
    // 한 번 받으면 이 경로로 캐시에 들어간다.
    if (response.ok && response.type === 'basic') {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    // 주소가 조금 달라도 캐시된 시작 페이지는 띄워준다.
    if (request.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }

    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(networkFirst(event.request));
});
