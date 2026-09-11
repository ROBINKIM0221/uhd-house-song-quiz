// 오프라인 캐시.
//
// 네트워크 우선(network-first) 전략을 쓴다. 인터넷이 되면 항상 최신 파일을
// 받고, 안 되면 마지막으로 성공한 응답을 캐시에서 꺼낸다.
//
// 캐시 우선으로 만들었더니 배포한 수정이 화면에 안 잡히는 문제가 있었다.
// 새 워커가 활성화된 '다음' 새로고침에야 반영돼서, 한 번만 새로고침한
// 사람은 계속 옛날 화면을 봤다. 부스 준비 중에 문구 하나 고칠 때마다
// 이걸 겪을 수는 없다.
const CACHE_VERSION = 'uhd-quiz-v11';

// 경기장 와이파이가 죽지는 않았는데 느리기만 한 경우가 제일 곤란하다.
// 이 시간을 넘기면 더 기다리지 않고 캐시로 넘어간다.
const NETWORK_TIMEOUT_MS = 4000;

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

// 음원은 따로 담는다. 개별 실패를 무시하며 하나씩 받으므로, 파일 하나가
// 빠져도 설치가 통째로 깨지지 않는다. 그 곡만 데모음으로 넘어간다.
//
// 재생될 때 담기게 두지 않는 이유가 있다. 브라우저는 오디오를 조각내서
// (Range 요청) 받는 경우가 많은데, 그렇게 온 206 응답은 Cache API가
// 저장하지 못한다. 그러면 경기장에서 음원만 못 불러와 데모음이 난다.
//
// 이 목록은 js/songs.js와 같아야 한다. test/sw.test.js가 검사한다.
const AUDIO_PRECACHE = [
  './audio/01-jalgaseyo.m4a',
  './audio/02-uriga.m4a',
  './audio/03-hongha.m4a',
  './audio/04-byeori.m4a',
  './audio/05-kkeutkkaji.m4a',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await cache.addAll(PRECACHE);
      await Promise.all(AUDIO_PRECACHE.map((url) => cache.add(url).catch(() => {})));
      await self.skipWaiting();
    })(),
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
    // 같은 출처의 온전한 응답만 담는다. 206 Partial Content 같은 것은
    // Cache API가 저장하지 못하고 예외를 던지므로 삼킨다.
    if (response.status === 200 && response.type === 'basic') {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    // ignoreVary 없이는 URL이 같아도 캐시에서 못 찾는다. GitHub Pages가
    // Vary: Accept-Encoding 을 붙이는데, 오디오 요소가 보내는 요청의
    // Accept-Encoding 은 설치할 때 쓴 일반 fetch 의 것과 달라서 매칭이
    // 깨진다. 온라인에서는 네트워크가 받아주니 드러나지 않고, 오프라인
    // 에서만 음원이 통째로 빠져 데모음이 났다.
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;

    // 주소가 조금 달라도 캐시된 시작 페이지는 띄워준다.
    if (request.mode === 'navigate') {
      const shell = await cache.match('./index.html', { ignoreVary: true });
      if (shell) return shell;
    }

    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(networkFirst(event.request));
});
