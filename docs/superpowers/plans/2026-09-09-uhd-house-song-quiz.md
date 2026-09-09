# UHD 하우스에서 들려온 노래 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 울산 HD FC 프렌즈 장외 부스 2에서 태블릿에 띄워놓고 쓰는, 변조된 응원가를 듣고 곡을 맞히는 오프라인 웹 프로그램을 만든다.

**Architecture:** 빌드 도구 없는 정적 웹 페이지. `quiz.js`는 DOM/오디오를 모르는 순수 로직으로 분리해 `node --test`로 검증하고, `app.js`가 상태 기계와 화면 전환을, `audio.js`가 재생과 폴백을 맡는다. 서비스워커로 전체 자산을 캐시해 네트워크 없이 동작한다.

**Tech Stack:** 순수 HTML/CSS/ES Modules, `node --test` (Node 24), Service Worker, GitHub Pages

**Spec:** `docs/superpowers/specs/2026-09-09-uhd-house-song-quiz-design.md`

## Global Constraints

- 빌드 단계 없음. 소스 파일을 그대로 서빙한다. 번들러·트랜스파일러·npm 런타임 의존성을 추가하지 않는다.
- 브라우저 코드는 ES Modules(`<script type="module">`)로 작성한다. `package.json`에 `"type": "module"`을 둬 Node 테스트가 같은 파일을 그대로 import 한다.
- 승점: 정답 3점, 오답 1점, 무응답 1점(오답으로 분류).
- 기본 타이밍: 재생 15초, 응답 5초, 결과 화면 자동 복귀 12초.
- 색상: 배경 `#10265E`, 포인트 `#FFC72C`, 본문 `#FFFFFF`. CSS 변수로 한 곳에 모은다.
- 곡 5개와 음원 파일명은 스펙 §6 표를 그대로 따른다. 화면 표기는 한글 곡명, 파일명은 로마자.
- 어떤 실패도 부스를 멈추지 않는다. 실패 시 기능을 줄여서라도 다음 참가자를 받을 수 있는 상태로 돌아간다.
- 보기 버튼 최소 높이 64px. 가로 2열 / 세로 1열.
- 커밋 메시지는 한국어로 쓰고, 아래 두 줄로 끝낸다.

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DD7X7FZzHaNdTkHHhdutUW
```

## 스펙 대비 파일 구조

스펙 §8에서 한 가지 벗어난다. 스펙은 `app.js`가 "화면 전환, 오디오 재생, 타이머"를 모두 맡는다고 했지만, 오디오는 파일 로드 실패 시 Web Audio로 데모음을 합성하는 독립적인 덩어리라 `js/audio.js`로 분리한다. `app.js`는 상태 기계에 집중한다.

| 파일 | 책임 |
|---|---|
| `package.json` | `"type": "module"` 선언, 테스트 스크립트 |
| `js/songs.js` | 곡 5개 데이터. 아무것에도 의존하지 않음 |
| `js/quiz.js` | 덱 생성·보기 생성·채점. 순수 함수, 난수 주입 |
| `js/audio.js` | 음원 재생, 실패 시 데모음 합성, 정지 |
| `js/app.js` | 상태 기계, DOM, 타이머, 설정, Wake Lock |
| `index.html` | 네 화면 + 설정 오버레이 마크업 |
| `css/style.css` | 브랜드 색상, 반응형 레이아웃 |
| `sw.js` | 오프라인 캐시 |
| `manifest.webmanifest` | 전체 화면 표시 |
| `test/quiz.test.js` | `quiz.js` 검증 |
| `audio/README.md` | 음원 파일명 규칙 |
| `README.md` | 현장 운영 매뉴얼 |

---

### Task 1: 프로젝트 뼈대와 곡 데이터

**Files:**
- Create: `package.json`
- Create: `js/songs.js`
- Create: `.gitignore`
- Test: `test/songs.test.js`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `SONGS` — `Array<{ id: number, title: string, file: string }>`. `id`는 1~5, 스펙 §6 표의 순서와 일치. 이후 모든 태스크가 이 배열을 곡의 단일 출처로 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/songs.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { SONGS } from '../js/songs.js';

test('곡은 정확히 5개다', () => {
  assert.equal(SONGS.length, 5);
});

test('id는 1부터 5까지 중복 없이 매겨진다', () => {
  assert.deepEqual(SONGS.map((s) => s.id), [1, 2, 3, 4, 5]);
});

test('기획안의 곡명을 순서대로 담는다', () => {
  assert.deepEqual(SONGS.map((s) => s.title), [
    '잘가세요',
    '우리가 살아가는 동안',
    '홍하의 골짜기',
    '별이 되어',
    '끝까지 달린다',
  ]);
});

test('음원 경로는 audio/ 아래의 로마자 mp3다', () => {
  for (const song of SONGS) {
    assert.match(song.file, /^audio\/0[1-5]-[a-z]+\.mp3$/);
  }
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test test/songs.test.js`
Expected: FAIL — `Cannot find module .../js/songs.js`

- [ ] **Step 3: package.json 작성**

```json
{
  "name": "uhd-house-song-quiz",
  "version": "1.0.0",
  "description": "울산 HD FC 프렌즈 장외 부스 - UHD 하우스에서 들려온 노래",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --test test/"
  }
}
```

- [ ] **Step 4: .gitignore 작성**

```
node_modules/
.DS_Store
Thumbs.db
```

- [ ] **Step 5: js/songs.js 작성**

```js
// 기획안 '프렌즈 장외 부스 기획안.pdf' 5~6쪽의 응원가 5곡.
// 파일명을 로마자로 두는 이유: 한글 파일명은 GitHub Pages 배포 시
// URL 인코딩 문제를 일으킬 수 있다. 화면에 뜨는 이름은 title이다.
export const SONGS = [
  { id: 1, title: '잘가세요', file: 'audio/01-jalgaseyo.mp3' },
  { id: 2, title: '우리가 살아가는 동안', file: 'audio/02-uriga.mp3' },
  { id: 3, title: '홍하의 골짜기', file: 'audio/03-hongha.mp3' },
  { id: 4, title: '별이 되어', file: 'audio/04-byeori.mp3' },
  { id: 5, title: '끝까지 달린다', file: 'audio/05-kkeutkkaji.mp3' },
];
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `node --test test/songs.test.js`
Expected: PASS — 4개 테스트 모두 통과

- [ ] **Step 7: 커밋**

```bash
git add package.json .gitignore js/songs.js test/songs.test.js
git commit -m "feat: 프로젝트 뼈대와 응원가 5곡 데이터

기획안 5~6쪽의 곡 목록을 SONGS 배열로 옮겼다. 음원 파일명은
GitHub Pages URL 인코딩 문제를 피하려고 로마자로 둔다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DD7X7FZzHaNdTkHHhdutUW"
```

---

### Task 2: 덱 생성 (곡 셔플)

**Files:**
- Create: `js/quiz.js`
- Test: `test/quiz.test.js`

**Interfaces:**
- Consumes: `SONGS` from `js/songs.js`
- Produces:
  - `shuffle(items, rand = Math.random) -> Array` — 새 배열을 반환하고 원본을 바꾸지 않는다.
  - `createDeck(songs, previousSongId = null, rand = Math.random) -> Array<Song>` — `songs`를 섞은 새 배열. 첫 곡의 `id`가 `previousSongId`와 같으면 다시 섞는다.

**배경:** 스펙 §5는 5곡을 셔플해 한 곡씩 소진하고 다 돌면 다시 섞으라고 한다. 바퀴 경계에서 같은 곡이 연달아 나오는 것을 막는 게 `previousSongId`의 목적이다.

**난수 주입:** 테스트를 결정적으로 만들려고 `rand`를 인자로 받는다. 테스트에서는 미리 정한 값을 순서대로 뱉는 가짜 함수를 넘긴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/quiz.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { SONGS } from '../js/songs.js';
import { shuffle, createDeck } from '../js/quiz.js';

// 미리 정한 값을 순서대로 뱉는 가짜 난수. 값이 떨어지면 처음으로 돌아간다.
function fakeRandom(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

test('shuffle은 원본을 바꾸지 않고 새 배열을 준다', () => {
  const original = [1, 2, 3, 4, 5];
  const copy = [...original];
  const result = shuffle(original, fakeRandom([0.1, 0.5, 0.9]));
  assert.notEqual(result, original);
  assert.deepEqual(original, copy);
});

test('shuffle은 원소를 잃거나 더하지 않는다', () => {
  const result = shuffle([1, 2, 3, 4, 5], fakeRandom([0.7, 0.2, 0.9, 0.4]));
  assert.deepEqual([...result].sort(), [1, 2, 3, 4, 5]);
});

test('덱 한 바퀴는 5곡을 정확히 한 번씩 담는다', () => {
  const deck = createDeck(SONGS, null, fakeRandom([0.3, 0.8, 0.1, 0.6]));
  assert.equal(deck.length, 5);
  assert.deepEqual(deck.map((s) => s.id).sort(), [1, 2, 3, 4, 5]);
});

test('새 덱의 첫 곡은 직전 곡과 같지 않다', () => {
  // 모든 곡을 직전 곡으로 놓고 100번씩 돌려도 첫 곡이 겹치지 않아야 한다.
  for (const previous of SONGS) {
    for (let i = 0; i < 100; i += 1) {
      const deck = createDeck(SONGS, previous.id);
      assert.notEqual(deck[0].id, previous.id);
    }
  }
});

test('직전 곡이 없으면 아무 곡이나 첫 곡이 될 수 있다', () => {
  const deck = createDeck(SONGS, null, fakeRandom([0.5]));
  assert.equal(deck.length, 5);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test test/quiz.test.js`
Expected: FAIL — `Cannot find module .../js/quiz.js`

- [ ] **Step 3: js/quiz.js 작성**

```js
// 화면도 오디오도 모르는 순수 로직. 난수를 인자로 받아 테스트에서
// 결정적으로 만들 수 있게 한다.

/** Fisher-Yates. 원본을 바꾸지 않고 새 배열을 반환한다. */
export function shuffle(items, rand = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * 곡 전체를 섞은 새 덱을 만든다.
 * 바퀴가 넘어갈 때 같은 곡이 연달아 나오지 않도록,
 * 첫 곡이 직전 곡과 같으면 다시 섞는다.
 */
export function createDeck(songs, previousSongId = null, rand = Math.random) {
  // 곡이 하나뿐이면 겹침을 피할 방법이 없다. 무한 루프를 만들지 않는다.
  if (songs.length <= 1) return [...songs];

  let deck = shuffle(songs, rand);
  while (deck[0].id === previousSongId) {
    deck = shuffle(songs, rand);
  }
  return deck;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/quiz.test.js`
Expected: PASS — 5개 테스트 모두 통과

- [ ] **Step 5: 커밋**

```bash
git add js/quiz.js test/quiz.test.js
git commit -m "feat: 곡 덱 셔플 로직

5곡을 섞어 한 바퀴씩 소진하고, 바퀴가 넘어갈 때 같은 곡이
연달아 나오지 않도록 첫 곡이 직전 곡과 겹치면 다시 섞는다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DD7X7FZzHaNdTkHHhdutUW"
```

---

### Task 3: 보기 생성과 채점

**Files:**
- Modify: `js/quiz.js`
- Modify: `test/quiz.test.js`

**Interfaces:**
- Consumes: `shuffle` from Task 2
- Produces:
  - `createChoices(songs, rand = Math.random) -> Array<Song>` — 5곡 전체를 섞은 보기 배열.
  - `score(answerId, selectedId) -> { correct: boolean, points: number, timedOut: boolean }` — `selectedId`가 `null`이면 무응답.
  - 상수 `POINTS_CORRECT = 3`, `POINTS_WRONG = 1`.

**배경:** 스펙 §5. 보기는 항상 5곡 전체이고 순서만 매번 섞인다. 채점은 정답 3점, 오답 1점, 무응답 1점이며 무응답은 오답으로 분류된다.

- [ ] **Step 1: 실패하는 테스트 추가**

`test/quiz.test.js` 상단 import 줄을 아래로 교체한다.

```js
import { shuffle, createDeck, createChoices, score, POINTS_CORRECT, POINTS_WRONG } from '../js/quiz.js';
```

그리고 파일 맨 아래에 아래 테스트를 덧붙인다.

```js
test('보기는 항상 5곡 전체를 담는다', () => {
  const choices = createChoices(SONGS, fakeRandom([0.4, 0.9, 0.2]));
  assert.equal(choices.length, 5);
  assert.deepEqual(choices.map((s) => s.id).sort(), [1, 2, 3, 4, 5]);
});

test('보기는 원본 배열을 바꾸지 않는다', () => {
  const before = SONGS.map((s) => s.id);
  createChoices(SONGS, fakeRandom([0.6, 0.1]));
  assert.deepEqual(SONGS.map((s) => s.id), before);
});

test('정답을 고르면 3점이다', () => {
  assert.deepEqual(score(3, 3), { correct: true, points: 3, timedOut: false });
});

test('오답을 고르면 1점이다', () => {
  assert.deepEqual(score(3, 5), { correct: false, points: 1, timedOut: false });
});

test('아무것도 안 고르면 오답으로 1점이다', () => {
  assert.deepEqual(score(3, null), { correct: false, points: 1, timedOut: true });
});

test('승점 상수는 기획안과 같다', () => {
  assert.equal(POINTS_CORRECT, 3);
  assert.equal(POINTS_WRONG, 1);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test test/quiz.test.js`
Expected: FAIL — `createChoices is not a function`

- [ ] **Step 3: js/quiz.js에 구현 추가**

파일 맨 아래에 덧붙인다.

```js
// 기획안: 정답 승점 3점, 오답 승점 1점.
export const POINTS_CORRECT = 3;
export const POINTS_WRONG = 1;

/** 보기는 항상 5곡 전체. 순서만 매번 섞는다. */
export function createChoices(songs, rand = Math.random) {
  return shuffle(songs, rand);
}

/**
 * 채점한다. selectedId가 null이면 시간 초과(무응답)이고,
 * 기획안에 따라 오답과 같은 1점을 준다.
 */
export function score(answerId, selectedId) {
  const timedOut = selectedId === null;
  const correct = !timedOut && selectedId === answerId;
  return {
    correct,
    points: correct ? POINTS_CORRECT : POINTS_WRONG,
    timedOut,
  };
}
```

- [ ] **Step 4: 전체 테스트 통과 확인**

Run: `npm test`
Expected: PASS — `songs.test.js` 4개 + `quiz.test.js` 11개, 합계 15개 통과

- [ ] **Step 5: 커밋**

```bash
git add js/quiz.js test/quiz.test.js
git commit -m "feat: 보기 생성과 채점 로직

보기는 5곡 전체를 매번 섞어 내보내고, 채점은 정답 3점 오답 1점에
무응답도 오답과 같은 1점으로 처리한다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DD7X7FZzHaNdTkHHhdutUW"
```

---

### Task 4: 화면 마크업과 디자인

**Files:**
- Create: `index.html`
- Create: `css/style.css`

**Interfaces:**
- Consumes: 없음 (정적 마크업)
- Produces: `app.js`가 붙잡을 DOM id들 —
  `#screen-idle`, `#screen-quiz`, `#screen-result`, `#overlay-settings`,
  `#btn-start`, `#btn-next`, `#choices`, `#play-timer`, `#answer-timer`,
  `#result-verdict`, `#result-points`, `#result-song`, `#demo-badge`,
  `#audio-warning`, `#logo`,
  `#setting-play`, `#setting-play-value`, `#setting-answer`,
  `#setting-answer-value`, `#setting-audio-status`,
  `#btn-refresh-cache`, `#btn-close-settings`.
  화면 전환은 각 `.screen` 요소의 `hidden` 속성으로 한다.

**배경:** 스펙 §4(화면 흐름), §7(디자인). 이 태스크는 마크업과 스타일만 만들고 동작은 넣지 않는다. 브라우저로 열었을 때 대기 화면이 보이면 성공이다.

- [ ] **Step 1: index.html 작성**

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#10265E">
  <title>UHD 하우스에서 들려온 노래</title>
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <!-- 대기 -->
  <section class="screen" id="screen-idle">
    <h1 class="logo" id="logo">UHD 하우스에서<br>들려온 노래</h1>
    <p class="tagline">울산의 멜로디를 찾아라!</p>
    <button class="btn-primary" id="btn-start" type="button">시작하기</button>
    <p class="hint">응원가를 듣고 어떤 곡인지 맞혀보세요</p>
  </section>

  <!-- 재생 + 응답 -->
  <section class="screen" id="screen-quiz" hidden>
    <div class="quiz-head">
      <div class="wave" aria-hidden="true">
        <span></span><span></span><span></span><span></span><span></span>
      </div>
      <p class="timer" id="play-timer">재생 중 15초</p>
      <p class="timer timer-answer" id="answer-timer" hidden>5</p>
      <p class="badge" id="demo-badge" hidden>데모 음원</p>
      <p class="badge badge-warn" id="audio-warning" hidden>소리가 나오지 않습니다</p>
    </div>
    <ul class="choices" id="choices"></ul>
  </section>

  <!-- 결과 -->
  <section class="screen" id="screen-result" hidden>
    <p class="verdict" id="result-verdict"></p>
    <p class="points" id="result-points"></p>
    <p class="answer-song" id="result-song"></p>
    <button class="btn-primary" id="btn-next" type="button">다음 참가자</button>
  </section>

  <!-- 설정 (오버레이) -->
  <div class="overlay" id="overlay-settings" hidden>
    <div class="panel">
      <h2>부스 설정</h2>
      <label class="field">
        재생 길이 <output id="setting-play-value">15</output>초
        <input type="range" id="setting-play" min="5" max="30" step="1" value="15">
      </label>
      <label class="field">
        응답 시간 <output id="setting-answer-value">5</output>초
        <input type="range" id="setting-answer" min="3" max="15" step="1" value="5">
      </label>
      <h3>음원 상태</h3>
      <ul class="audio-status" id="setting-audio-status"></ul>
      <div class="panel-actions">
        <button class="btn-secondary" id="btn-refresh-cache" type="button">캐시 새로고침</button>
        <button class="btn-primary" id="btn-close-settings" type="button">닫기</button>
      </div>
    </div>
  </div>

  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: css/style.css 작성**

```css
/* 울산 HD FC 브랜드 컬러. 공식 코드가 따로 있으면 여기만 고치면 된다. */
:root {
  --navy: #10265E;
  --navy-deep: #0A1A42;
  --gold: #FFC72C;
  --white: #FFFFFF;
  --muted: #8C9BC4;
  --wrong: #4A5B8C;
  --gap: clamp(12px, 2.5vmin, 24px);
}

* { box-sizing: border-box; }

html, body {
  height: 100%;
  margin: 0;
}

body {
  background: var(--navy);
  color: var(--white);
  font-family: 'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif;
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  overflow: hidden;
}

.screen {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--gap);
  padding: var(--gap);
  text-align: center;
}

.screen[hidden] { display: none; }

/* 대기 화면 */
.logo {
  margin: 0;
  font-size: clamp(32px, 7vmin, 72px);
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: -0.02em;
  cursor: pointer;
}

.tagline {
  margin: 0;
  color: var(--gold);
  font-size: clamp(18px, 3.5vmin, 34px);
  font-weight: 700;
}

.hint {
  margin: 0;
  color: var(--muted);
  font-size: clamp(13px, 2vmin, 20px);
}

.btn-primary {
  min-height: 72px;
  padding: 0 clamp(32px, 6vmin, 72px);
  border: 0;
  border-radius: 999px;
  background: var(--gold);
  color: var(--navy-deep);
  font-family: inherit;
  font-size: clamp(20px, 3.5vmin, 32px);
  font-weight: 800;
  cursor: pointer;
}

.btn-primary:active { transform: scale(0.97); }

.btn-secondary {
  min-height: 56px;
  padding: 0 24px;
  border: 2px solid var(--muted);
  border-radius: 999px;
  background: transparent;
  color: var(--white);
  font-family: inherit;
  font-size: clamp(15px, 2.2vmin, 20px);
  font-weight: 700;
  cursor: pointer;
}

/* 재생 화면 */
.quiz-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.wave {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: clamp(40px, 8vmin, 88px);
}

.wave span {
  width: clamp(6px, 1.2vmin, 12px);
  border-radius: 999px;
  background: var(--gold);
  animation: bounce 0.9s ease-in-out infinite;
}

.wave span:nth-child(1) { height: 40%; animation-delay: 0s; }
.wave span:nth-child(2) { height: 75%; animation-delay: 0.15s; }
.wave span:nth-child(3) { height: 100%; animation-delay: 0.3s; }
.wave span:nth-child(4) { height: 65%; animation-delay: 0.45s; }
.wave span:nth-child(5) { height: 35%; animation-delay: 0.6s; }

@keyframes bounce {
  0%, 100% { transform: scaleY(0.4); }
  50% { transform: scaleY(1); }
}

/* 애니메이션을 줄이도록 설정한 기기에서는 멈춘다 */
@media (prefers-reduced-motion: reduce) {
  .wave span { animation: none; }
}

.timer {
  margin: 0;
  color: var(--muted);
  font-size: clamp(15px, 2.4vmin, 24px);
  font-weight: 700;
}

.timer-answer {
  color: var(--gold);
  font-size: clamp(48px, 12vmin, 140px);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.timer[hidden], .badge[hidden] { display: none; }

.badge {
  margin: 0;
  padding: 4px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  color: var(--muted);
  font-size: clamp(11px, 1.6vmin, 15px);
  font-weight: 700;
}

.badge-warn {
  background: var(--gold);
  color: var(--navy-deep);
}

/* 보기 */
.choices {
  display: grid;
  gap: clamp(8px, 1.6vmin, 16px);
  width: min(100%, 1100px);
  margin: 0;
  padding: 0;
  list-style: none;
}

.choice {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 64px;
  padding: 12px 20px;
  border: 3px solid rgba(255, 255, 255, 0.25);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--white);
  font-family: inherit;
  font-size: clamp(17px, 2.8vmin, 30px);
  font-weight: 700;
  cursor: pointer;
}

.choice:active {
  border-color: var(--gold);
  background: rgba(255, 199, 44, 0.2);
}

/* 세로: 1열, 가로: 2열 */
@media (orientation: landscape) {
  .choices { grid-template-columns: 1fr 1fr; }
  /* 5개 중 마지막 하나는 두 칸을 차지해 가운데로 온다 */
  .choices li:nth-child(5) { grid-column: 1 / -1; }
}

/* 결과 화면 */
.verdict {
  margin: 0;
  font-size: clamp(40px, 9vmin, 96px);
  font-weight: 800;
}

.verdict.correct { color: var(--gold); }
.verdict.wrong { color: var(--wrong); }

.points {
  margin: 0;
  font-size: clamp(24px, 5vmin, 56px);
  font-weight: 800;
}

.answer-song {
  margin: 0;
  color: var(--muted);
  font-size: clamp(15px, 2.6vmin, 26px);
  font-weight: 700;
}

/* 설정 오버레이 */
.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--gap);
  background: rgba(10, 26, 66, 0.9);
}

.overlay[hidden] { display: none; }

.panel {
  width: min(100%, 560px);
  max-height: 100%;
  padding: 24px;
  overflow-y: auto;
  border: 2px solid var(--muted);
  border-radius: 20px;
  background: var(--navy-deep);
  text-align: left;
}

.panel h2 { margin: 0 0 16px; font-size: 24px; }
.panel h3 { margin: 20px 0 8px; font-size: 17px; color: var(--muted); }

.field {
  display: block;
  margin-bottom: 16px;
  font-size: 17px;
  font-weight: 700;
}

.field input[type="range"] {
  display: block;
  width: 100%;
  margin-top: 8px;
  accent-color: var(--gold);
}

.audio-status {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 15px;
}

.audio-status li {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.audio-status .ok { color: var(--gold); }
.audio-status .missing { color: var(--muted); }

.panel-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.panel-actions button { flex: 1; }
```

- [ ] **Step 3: 브라우저로 확인**

Run: `npx --yes serve -l 5173 .`
브라우저로 `http://localhost:5173` 접속.
Expected: 남색 배경에 "UHD 하우스에서 들려온 노래" 제목, 노란 "울산의 멜로디를 찾아라!", 노란 [시작하기] 버튼이 보인다. 콘솔에 `js/app.js` 404 오류가 뜨는 것은 정상이다 (Task 6에서 만든다).

- [ ] **Step 4: 커밋**

```bash
git add index.html css/style.css
git commit -m "feat: 화면 마크업과 브랜드 디자인

대기·재생·결과 세 화면과 설정 오버레이의 마크업을 만들고, 남색
배경에 골드 포인트를 쓰는 스타일을 붙였다. 보기 버튼은 최소 높이
64px, 가로에서는 2열 세로에서는 1열로 배치한다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DD7X7FZzHaNdTkHHhdutUW"
```

---

### Task 5: 오디오 재생과 데모음 폴백

**Files:**
- Create: `js/audio.js`

**Interfaces:**
- Consumes: 없음 (브라우저 API만 사용)
- Produces:
  - `createPlayer() -> Player`
  - `Player.play(file) -> Promise<'file' | 'demo' | 'silent'>` — 재생을 시작하고 어떤 방식으로 소리가 났는지 알려준다. `'file'`은 음원 정상, `'demo'`는 파일이 없어 데모음으로 대체, `'silent'`는 브라우저가 소리를 막아 무음.
  - `Player.stop() -> void` — 재생 중인 것을 즉시 멈춘다. 여러 번 불러도 안전하다.
  - `Player.probe(files) -> Promise<Array<{ file: string, ok: boolean }>>` — 설정 화면의 음원 상태 점검용.

**배경:** 스펙 §6(음원 부재 시 동작), §10(오류 처리). 음원이 아직 없으므로 파일 로드에 실패하면 Web Audio로 합성한 짧은 전자음을 대신 재생한다. 브라우저가 소리를 아예 막으면 `'silent'`를 돌려주고, 퀴즈는 소리 없이 그대로 진행한다.

**주의:** 이 파일은 브라우저 API에 의존하므로 `node --test` 대상이 아니다. Task 6의 브라우저 확인 목록으로 검증한다.

- [ ] **Step 1: js/audio.js 작성**

```js
// 음원 재생. 파일이 없으면 Web Audio로 합성한 데모음으로 대체한다.
// 음원 5개가 아직 도착하지 않았고, 당일 파일이 하나 빠져도 부스가
// 멈추면 안 되기 때문이다.

// 데모음: 곡마다 다르게 들리도록 파일 경로에서 시작 음을 뽑는다.
const DEMO_SCALE = [392.0, 440.0, 493.88, 523.25, 587.33, 659.25];
const DEMO_NOTES = 8;
const DEMO_STEP = 0.35;

function hashToIndex(text, length) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 100000;
  }
  return hash % length;
}

export function createPlayer() {
  const element = new Audio();
  element.preload = 'auto';

  let audioContext = null;
  let demoNodes = [];

  function stopDemo() {
    for (const node of demoNodes) {
      try {
        node.stop();
      } catch {
        // 이미 멈춘 노드. 무시한다.
      }
    }
    demoNodes = [];
  }

  /** 파일이 없을 때 대신 내보내는 짧은 전자음 시퀀스. */
  function playDemo(file) {
    try {
      if (!audioContext) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return false;
        audioContext = new Ctx();
      }
      if (audioContext.state === 'suspended') audioContext.resume();

      const start = hashToIndex(file, DEMO_SCALE.length);
      const now = audioContext.currentTime;

      for (let i = 0; i < DEMO_NOTES; i += 1) {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = 'triangle';
        osc.frequency.value = DEMO_SCALE[(start + i * 2) % DEMO_SCALE.length];
        const at = now + i * DEMO_STEP;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.25, at + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + DEMO_STEP - 0.03);
        osc.connect(gain).connect(audioContext.destination);
        osc.start(at);
        osc.stop(at + DEMO_STEP);
        demoNodes.push(osc);
      }
      return true;
    } catch {
      return false;
    }
  }

  return {
    async play(file) {
      this.stop();
      try {
        element.src = file;
        element.currentTime = 0;
        await element.play();
        return 'file';
      } catch {
        // 파일이 없거나(404) 디코딩에 실패했거나 브라우저가 막았다.
        // 어느 쪽이든 데모음으로 넘어간다.
        return playDemo(file) ? 'demo' : 'silent';
      }
    },

    stop() {
      try {
        element.pause();
      } catch {
        // 아직 재생한 적이 없다. 무시한다.
      }
      stopDemo();
    },

    async probe(files) {
      return Promise.all(
        files.map(async (file) => {
          try {
            const response = await fetch(file, { method: 'HEAD' });
            return { file, ok: response.ok };
          } catch {
            return { file, ok: false };
          }
        }),
      );
    },
  };
}
```

- [ ] **Step 2: 테스트가 깨지지 않았는지 확인**

Run: `npm test`
Expected: PASS — 기존 15개 테스트 그대로 통과 (`audio.js`는 Node 테스트 대상이 아니다)

- [ ] **Step 3: 커밋**

```bash
git add js/audio.js
git commit -m "feat: 음원 재생과 데모음 폴백

파일 로드나 재생에 실패하면 Web Audio로 합성한 짧은 전자음을
대신 내보낸다. 음원이 아직 도착하지 않아 지금 전체 흐름을
테스트하려면 필요하고, 당일 파일이 빠져도 부스가 멈추지 않는다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DD7X7FZzHaNdTkHHhdutUW"
```

---

### Task 6: 상태 기계와 화면 전환

**Files:**
- Create: `js/app.js`

**Interfaces:**
- Consumes: `SONGS` (Task 1), `createDeck` / `createChoices` / `score` (Task 2·3), `createPlayer` (Task 5), Task 4의 DOM id들
- Produces: 브라우저에서 도는 완성된 퀴즈 흐름. `state`, `dom`, `player`, `clearTimers()`, `later()`, `goIdle()` — Task 7이 이어서 쓴다.

**배경:** 스펙 §4. 상태는 `idle` → `playing` → `answering` → `result` → `idle`. 설정 오버레이는 상태가 아니라 덮개다.

**타이밍 규칙 (스펙 §4):**
- `playing`: 최대 15초. 이 동안에도 보기를 누를 수 있고, 누르면 즉시 `result`로 간다.
- `answering`: 음원 정지 후 5초 카운트다운. 다 지나면 무응답(오답)으로 `result`.
- `result`: 12초 뒤 자동으로 `idle` 복귀. [다음 참가자]를 누르면 즉시 복귀.
- 남은 재생 시간과 응답 카운트다운을 동시에 보여주지 않는다.

- [ ] **Step 1: js/app.js 작성**

```js
import { SONGS } from './songs.js';
import { createDeck, createChoices, score } from './quiz.js';
import { createPlayer } from './audio.js';

const DEFAULTS = { playSeconds: 15, answerSeconds: 5 };
const RESULT_AUTO_RESET_MS = 12000;

const el = (id) => document.getElementById(id);

const dom = {
  screens: {
    idle: el('screen-idle'),
    quiz: el('screen-quiz'),
    result: el('screen-result'),
  },
  btnStart: el('btn-start'),
  btnNext: el('btn-next'),
  choices: el('choices'),
  playTimer: el('play-timer'),
  answerTimer: el('answer-timer'),
  demoBadge: el('demo-badge'),
  audioWarning: el('audio-warning'),
  resultVerdict: el('result-verdict'),
  resultPoints: el('result-points'),
  resultSong: el('result-song'),
};

const player = createPlayer();

const state = {
  settings: { ...DEFAULTS },
  deck: [],
  lastSongId: null,
  currentSong: null,
  answered: false,
  timers: [],
};

/** 걸어둔 타이머를 모두 끊는다. 화면을 바꿀 때마다 부른다. */
function clearTimers() {
  for (const id of state.timers) clearTimeout(id);
  state.timers = [];
}

function later(fn, ms) {
  const id = setTimeout(fn, ms);
  state.timers.push(id);
  return id;
}

function showScreen(name) {
  for (const [key, node] of Object.entries(dom.screens)) {
    node.hidden = key !== name;
  }
}

/** 덱이 비면 새로 섞는다. 바퀴 경계에서 같은 곡이 겹치지 않게 직전 곡을 넘긴다. */
function drawSong() {
  if (state.deck.length === 0) {
    state.deck = createDeck(SONGS, state.lastSongId);
  }
  const song = state.deck.shift();
  state.lastSongId = song.id;
  return song;
}

function renderChoices(songs) {
  dom.choices.replaceChildren();
  for (const song of songs) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice';
    button.textContent = song.title;
    button.addEventListener('click', () => finish(song.id));
    li.append(button);
    dom.choices.append(li);
  }
}

// --- idle -------------------------------------------------------------

function goIdle() {
  clearTimers();
  player.stop();
  state.currentSong = null;
  state.answered = false;
  showScreen('idle');
}

// --- playing ----------------------------------------------------------

async function startQuestion() {
  clearTimers();
  state.answered = false;
  state.currentSong = drawSong();

  renderChoices(createChoices(SONGS));
  dom.answerTimer.hidden = true;
  dom.playTimer.hidden = false;
  dom.playTimer.textContent = `재생 중 ${state.settings.playSeconds}초`;
  dom.demoBadge.hidden = true;
  dom.audioWarning.hidden = true;
  showScreen('quiz');

  // 참가자가 [시작하기]를 누른 제스처 안에서 재생을 건다.
  // iOS의 자동재생 차단을 여기서 통과한다.
  const mode = await player.play(state.currentSong.file);

  // 재생을 기다리는 동안 참가자가 이미 답했거나 대기 화면으로
  // 돌아갔을 수 있다. 그러면 타이머를 새로 걸지 않는다.
  if (state.answered || state.currentSong === null) return;

  if (mode === 'demo') dom.demoBadge.hidden = false;
  if (mode === 'silent') dom.audioWarning.hidden = false;

  countdownPlay(state.settings.playSeconds);
}

function countdownPlay(remaining) {
  if (state.answered) return;
  dom.playTimer.textContent = `재생 중 ${remaining}초`;
  if (remaining <= 0) {
    startAnswering();
    return;
  }
  later(() => countdownPlay(remaining - 1), 1000);
}

// --- answering --------------------------------------------------------

function startAnswering() {
  clearTimers();
  player.stop();
  dom.playTimer.hidden = true;
  dom.answerTimer.hidden = false;
  countdownAnswer(state.settings.answerSeconds);
}

function countdownAnswer(remaining) {
  if (state.answered) return;
  if (remaining <= 0) {
    finish(null); // 무응답 = 오답
    return;
  }
  dom.answerTimer.textContent = String(remaining);
  later(() => countdownAnswer(remaining - 1), 1000);
}

// --- result -----------------------------------------------------------

function finish(selectedId) {
  if (state.answered || state.currentSong === null) return; // 연타 방지
  state.answered = true;
  clearTimers();
  player.stop();

  const result = score(state.currentSong.id, selectedId);

  dom.resultVerdict.textContent = result.correct ? '정답!' : '아쉬워요';
  dom.resultVerdict.className = `verdict ${result.correct ? 'correct' : 'wrong'}`;
  dom.resultPoints.textContent = `승점 ${result.points}점`;
  dom.resultSong.textContent = `정답: ${state.currentSong.title}`;

  showScreen('result');
  // 참가자가 그냥 자리를 떠도 다음 사람이 바로 시작할 수 있어야 한다.
  later(goIdle, RESULT_AUTO_RESET_MS);
}

// --- 연결 -------------------------------------------------------------

dom.btnStart.addEventListener('click', startQuestion);
dom.btnNext.addEventListener('click', goIdle);

goIdle();
```

- [ ] **Step 2: 브라우저로 전체 흐름 확인**

Run: `npx --yes serve -l 5173 .`
브라우저로 `http://localhost:5173` 접속 후 아래를 순서대로 확인한다.

1. [시작하기]를 누르면 재생 화면으로 넘어가고 "데모 음원" 배지와 함께 전자음이 난다 (음원 파일이 아직 없으므로 정상).
2. 보기 5개가 뜨고, 재생 중에 아무 보기나 누르면 즉시 결과 화면으로 간다.
3. 아무것도 안 누르고 기다리면 15초 뒤 큰 숫자 카운트다운 5→1이 뜨고, 다 지나면 "아쉬워요 / 승점 1점"이 뜬다.
4. 정답 곡명이 결과 화면에 표시된다.
5. [다음 참가자]를 누르면 대기 화면으로 돌아간다.
6. 아무것도 안 누르면 12초 뒤 저절로 대기 화면으로 돌아간다.
7. 5번 연속 플레이하면 5곡이 겹치지 않고 한 번씩 나온다.

- [ ] **Step 3: 테스트가 깨지지 않았는지 확인**

Run: `npm test`
Expected: PASS — 15개 테스트 통과

- [ ] **Step 4: 커밋**

```bash
git add js/app.js
git commit -m "feat: 상태 기계와 화면 전환

대기-재생-응답-결과 흐름을 붙였다. 재생 중에도 보기를 누를 수
있어 곡을 아는 참가자는 바로 끝낼 수 있고, 무응답은 오답으로
처리한다. 결과 화면은 12초 뒤 저절로 대기 화면으로 돌아간다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DD7X7FZzHaNdTkHHhdutUW"
```

---

### Task 7: 설정 오버레이와 화면 꺼짐 방지

**Files:**
- Modify: `js/app.js`

**Interfaces:**
- Consumes: Task 6의 `state`, `dom`, `player`, `clearTimers()`, `goIdle()`, Task 4의 설정 DOM id들
- Produces: 없음 (내부 기능)

**배경:** 스펙 §4.5(숨은 설정 화면), §7(Wake Lock), §10(localStorage 사용 불가 시 기본값).

로고를 2초 길게 눌러야 열린다. 참가자가 우연히 들어가지 않을 만큼 숨기되 스태프는 코드를 안 고치고 대응할 수 있게 한다. 설정값은 `localStorage`에 저장하고, 읽거나 쓰지 못해도 기본값으로 조용히 넘어간다.

- [ ] **Step 1: 설정 저장 함수 추가**

`js/app.js`에서 `const RESULT_AUTO_RESET_MS = 12000;` 줄 바로 아래에 넣는다.

```js
const STORAGE_KEY = 'uhd-quiz-settings';
const LONG_PRESS_MS = 2000;

/** localStorage를 못 쓰는 환경(사파리 프라이빗 등)에서도 기본값으로 돈다. */
function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const saved = JSON.parse(raw);
    return {
      playSeconds: Number(saved.playSeconds) || DEFAULTS.playSeconds,
      answerSeconds: Number(saved.answerSeconds) || DEFAULTS.answerSeconds,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 저장 못 해도 이번 세션 동안은 메모리 값으로 동작한다.
  }
}
```

- [ ] **Step 2: dom 객체에 설정 요소 추가**

`dom` 객체의 `resultSong: el('result-song'),` 줄 뒤에 넣는다.

```js
  logo: el('logo'),
  overlay: el('overlay-settings'),
  settingPlay: el('setting-play'),
  settingPlayValue: el('setting-play-value'),
  settingAnswer: el('setting-answer'),
  settingAnswerValue: el('setting-answer-value'),
  audioStatus: el('setting-audio-status'),
  btnRefreshCache: el('btn-refresh-cache'),
  btnCloseSettings: el('btn-close-settings'),
```

- [ ] **Step 3: state 초기화를 저장된 설정으로 교체**

`state` 객체에서 아래 한 줄을 바꾼다.

```js
// 기존:  settings: { ...DEFAULTS },
// 교체:
  settings: loadSettings(),
```

- [ ] **Step 4: "// --- 연결" 블록 바로 위에 설정·Wake Lock 코드 추가**

```js
// --- 설정 오버레이 ----------------------------------------------------

async function renderAudioStatus() {
  dom.audioStatus.replaceChildren();
  const results = await player.probe(SONGS.map((s) => s.file));
  for (const [index, entry] of results.entries()) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = SONGS[index].title;
    const mark = document.createElement('span');
    mark.className = entry.ok ? 'ok' : 'missing';
    mark.textContent = entry.ok ? '정상' : '없음 (데모음)';
    li.append(name, mark);
    dom.audioStatus.append(li);
  }
}

function openSettings() {
  clearTimers();
  player.stop();
  dom.settingPlay.value = String(state.settings.playSeconds);
  dom.settingPlayValue.textContent = String(state.settings.playSeconds);
  dom.settingAnswer.value = String(state.settings.answerSeconds);
  dom.settingAnswerValue.textContent = String(state.settings.answerSeconds);
  dom.overlay.hidden = false;
  renderAudioStatus();
}

function closeSettings() {
  dom.overlay.hidden = true;
  goIdle();
}

dom.settingPlay.addEventListener('input', () => {
  state.settings.playSeconds = Number(dom.settingPlay.value);
  dom.settingPlayValue.textContent = dom.settingPlay.value;
  saveSettings(state.settings);
});

dom.settingAnswer.addEventListener('input', () => {
  state.settings.answerSeconds = Number(dom.settingAnswer.value);
  dom.settingAnswerValue.textContent = dom.settingAnswer.value;
  saveSettings(state.settings);
});

dom.btnCloseSettings.addEventListener('click', closeSettings);

dom.btnRefreshCache.addEventListener('click', async () => {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    const registrations = await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((registrations ?? []).map((r) => r.unregister()));
  } catch {
    // 캐시를 못 비워도 새로고침은 시도한다.
  }
  location.reload();
});

// 로고를 2초 길게 누르면 열린다. 참가자가 우연히 들어가지 못하게.
let pressTimer = null;

function startPress() {
  pressTimer = setTimeout(openSettings, LONG_PRESS_MS);
}

function cancelPress() {
  if (pressTimer) clearTimeout(pressTimer);
  pressTimer = null;
}

dom.logo.addEventListener('pointerdown', startPress);
dom.logo.addEventListener('pointerup', cancelPress);
dom.logo.addEventListener('pointerleave', cancelPress);
dom.logo.addEventListener('pointercancel', cancelPress);
// 길게 누를 때 뜨는 iOS 텍스트 선택/확대 메뉴를 막는다.
dom.logo.addEventListener('contextmenu', (event) => event.preventDefault());

// --- 화면 꺼짐 방지 ---------------------------------------------------

let wakeLock = null;

async function requestWakeLock() {
  try {
    if (!('wakeLock' in navigator)) return;
    wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    // 지원하지 않거나 거부됨. 무시하고 진행한다.
  }
}

// 다른 앱에 갔다 돌아오면 잠금이 풀려 있으므로 다시 건다.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') requestWakeLock();
});

requestWakeLock();
```

- [ ] **Step 5: 브라우저로 확인**

Run: `npx --yes serve -l 5173 .`

1. 대기 화면에서 제목을 2초 길게 누르면 설정 오버레이가 뜬다.
2. 짧게 누르면 안 뜬다.
3. 재생 길이 슬라이더를 10으로 내리고 닫은 뒤 시작하면 "재생 중 10초"부터 센다.
4. 새로고침해도 10초가 유지된다.
5. 음원 상태 목록에 곡 5개가 모두 "없음 (데모음)"으로 뜬다 (음원 파일이 아직 없으므로 정상).
6. [캐시 새로고침]을 누르면 페이지가 다시 로드된다.

- [ ] **Step 6: 테스트가 깨지지 않았는지 확인**

Run: `npm test`
Expected: PASS — 15개 테스트 통과

- [ ] **Step 7: 커밋**

```bash
git add js/app.js
git commit -m "feat: 숨은 설정 오버레이와 화면 꺼짐 방지

로고를 2초 길게 누르면 재생 길이와 응답 시간을 조절하고 음원
로드 상태를 점검할 수 있다. 현장에서 코드를 고치지 않고 대응하기
위한 것이다. 설정은 localStorage에 저장하되 못 쓰는 환경에서는
기본값으로 넘어간다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DD7X7FZzHaNdTkHHhdutUW"
```

---

### Task 8: 오프라인 캐시

**Files:**
- Create: `sw.js`
- Create: `manifest.webmanifest`
- Create: `icon.svg`
- Modify: `js/app.js`

**Interfaces:**
- Consumes: Task 1~7의 모든 자산
- Produces: `sw.js`의 `CACHE_VERSION` 문자열 — 음원 교체 배포 시 이 값을 올린다.

**배경:** 스펙 §9. 첫 방문 때 전부 캐시하고 이후 캐시 우선으로 응답한다. 부스 당일에는 와이파이가 되는 곳에서 한 번 열어 캐시를 채운 뒤 탭을 닫지 않는다.

**음원 처리:** 음원 파일이 아직 없어 사전 캐시 목록에 넣으면 설치가 통째로 실패한다. 음원은 요청이 실제로 들어올 때 캐시에 넣는다.

- [ ] **Step 1: icon.svg 작성**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#10265E"/>
  <path d="M196 132v186a54 54 0 1 0 28 47V196l110-26v122a54 54 0 1 0 28 47V100z" fill="#FFC72C"/>
</svg>
```

- [ ] **Step 2: manifest.webmanifest 작성**

```json
{
  "name": "UHD 하우스에서 들려온 노래",
  "short_name": "UHD 하우스",
  "description": "울산 HD FC 프렌즈 장외 부스 음악 퀴즈",
  "start_url": "./",
  "scope": "./",
  "display": "fullscreen",
  "orientation": "any",
  "background_color": "#10265E",
  "theme_color": "#10265E",
  "icons": [
    { "src": "icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" }
  ]
}
```

- [ ] **Step 3: sw.js 작성**

```js
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
```

- [ ] **Step 4: js/app.js 맨 아래에 서비스워커 등록 추가**

```js
// --- 오프라인 캐시 ----------------------------------------------------

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // 등록에 실패해도 온라인이면 정상 동작한다. 콘솔에만 남긴다.
    navigator.serviceWorker.register('sw.js').catch((error) => {
      console.warn('서비스워커 등록 실패:', error);
    });
  });
}
```

- [ ] **Step 5: 오프라인 동작 확인**

Run: `npx --yes serve -l 5173 .`

1. `http://localhost:5173` 접속 후 한 판 플레이한다.
2. 개발자 도구 > Application > Service Workers에 `sw.js`가 activated로 뜨는지 본다.
3. 개발자 도구 > Network에서 Offline을 켠다.
4. 새로고침한다. 페이지가 정상으로 뜨고 퀴즈가 그대로 돌아가야 한다.
5. Offline을 끈다.

- [ ] **Step 6: 테스트가 깨지지 않았는지 확인**

Run: `npm test`
Expected: PASS — 15개 테스트 통과

- [ ] **Step 7: 커밋**

```bash
git add sw.js manifest.webmanifest icon.svg js/app.js
git commit -m "feat: 오프라인 캐시와 전체 화면 매니페스트

서비스워커로 HTML/CSS/JS를 사전 캐시하고 음원은 요청 시 담는다.
음원이 아직 없어 사전 캐시 목록에 넣으면 설치가 실패하기 때문이다.
매니페스트는 홈 화면에 추가했을 때 주소창 없이 뜨게 한다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DD7X7FZzHaNdTkHHhdutUW"
```

---

### Task 9: 운영 문서

**Files:**
- Create: `README.md`
- Create: `audio/README.md`

**Interfaces:**
- Consumes: Task 1~8 전체
- Produces: 없음 (문서)

**배경:** 스펙 §9(부스 당일 절차), §11(현장 점검 목록), §13(남은 의존성). 이 프로그램은 코드를 모르는 스태프가 현장에서 쓴다. 문서가 곧 인수인계다.

- [ ] **Step 1: audio/README.md 작성**

```markdown
# 음원 파일 넣는 곳

변조된 응원가 mp3 5개를 아래 이름 그대로 이 폴더에 넣는다.

| 곡명 | 파일명 |
|---|---|
| 잘가세요 | `01-jalgaseyo.mp3` |
| 우리가 살아가는 동안 | `02-uriga.mp3` |
| 홍하의 골짜기 | `03-hongha.mp3` |
| 별이 되어 | `04-byeori.mp3` |
| 끝까지 달린다 | `05-kkeutkkaji.mp3` |

## 규칙

- **파일명은 정확히 위와 같아야 한다.** 한 글자라도 다르면 그 곡은
  데모음(전자음)으로 대체 재생된다.
- 길이는 상관없다. 프로그램이 앞 15초만 재생하고 자동으로 멈춘다.
- 파일이 없어도 프로그램은 멈추지 않고 데모음으로 돈다. 대신 화면에
  "데모 음원" 배지가 뜬다.

## 넣은 뒤 할 일

1. `sw.js` 첫 줄의 `CACHE_VERSION`을 `uhd-quiz-v1` → `uhd-quiz-v2`처럼 올린다.
   올리지 않으면 이미 캐시된 태블릿에서 새 음원이 안 잡힌다.
2. 커밋하고 푸시한다.
3. 태블릿에서 페이지를 열고, 로고를 2초 길게 눌러 설정 화면의
   **음원 상태**가 5곡 모두 "정상"인지 확인한다.
```

- [ ] **Step 2: README.md 작성**

```markdown
# UHD 하우스에서 들려온 노래

울산 HD FC 대학생 마케터 '프렌즈' 장외 부스 이벤트 **부스 2**에서
태블릿에 띄워놓고 쓰는 음악 퀴즈 프로그램이다.

변조된 울산 HD 응원가를 듣고 어떤 곡인지 맞히면 팀 승점을 얻는다.

- 정답 → 승점 **3점**
- 오답 또는 무응답 → 승점 **1점**

승점은 프로그램이 집계하지 않는다. 기획안대로 스태프가 전입 신고서에
적고 화이트보드로 합산한다.

## 부스 당일 준비 (중요)

**경기장에 가기 전, 와이파이가 되는 곳에서 반드시 아래를 먼저 한다.**

1. 태블릿 브라우저로 배포 주소를 연다.
2. 한 판 플레이해서 소리가 스피커로 잘 나오는지 확인한다.
3. **탭을 닫지 않는다.** 이 상태면 경기장에서 데이터가 끊겨도 계속 돌아간다.

추가로 해두면 좋은 것:

- 사파리 공유 버튼 > **홈 화면에 추가** → 주소창 없이 전체 화면으로 뜬다.
  참가자가 실수로 다른 페이지로 나갈 여지가 줄어든다.
- 태블릿을 **저전력 모드 해제** 상태로 둔다. 저전력 모드에서는 화면 꺼짐
  방지가 동작하지 않을 수 있다.
- 블루투스 스피커를 미리 연결하고 볼륨을 **기기 볼륨으로** 맞춘다.
  프로그램 안에는 볼륨 조절이 없다.

## 진행 방법

참가자가 처음부터 끝까지 직접 태블릿을 누른다. 스태프는 설명과 승점 부여만 한다.

1. 참가자가 **[시작하기]** 를 누른다.
2. 응원가가 최대 15초 재생된다. 보기 5개는 처음부터 떠 있으므로
   곡을 아는 참가자는 재생 중에 바로 눌러도 된다.
3. 15초가 지나면 소리가 멈추고 **5초 카운트다운**이 크게 뜬다.
4. 5초 안에 아무것도 안 누르면 오답 처리된다.
5. 결과 화면에 승점과 정답 곡명이 뜬다. 스태프가 이 점수를 전입 신고서에 적는다.
6. **[다음 참가자]** 를 누르면 처음으로 돌아간다.
   아무도 안 눌러도 12초 뒤 저절로 돌아간다.

한 명당 약 20초 걸린다.

## 현장 대응

### 설정 화면 여는 법

대기 화면의 **제목을 손가락으로 2초간 꾹 누른다.** 참가자가 우연히
들어가지 않도록 일부러 숨겨놨다.

여기서 할 수 있는 것:

| 항목 | 설명 |
|---|---|
| 재생 길이 | 기본 15초. 줄이 밀리면 10초로 줄인다 |
| 응답 시간 | 기본 5초 |
| 음원 상태 | 곡 5개가 "정상"인지 "없음"인지 확인 |
| 캐시 새로고침 | 음원을 교체 배포한 뒤 누른다 |

### 문제가 생기면

| 증상 | 대응 |
|---|---|
| 소리가 안 난다 | 블루투스 연결과 기기 볼륨을 먼저 본다. 화면에 "소리가 나오지 않습니다"가 뜨면 페이지를 새로고침한다 |
| "데모 음원" 배지가 뜬다 | 음원 파일이 없다는 뜻. 설정 화면에서 어느 곡이 빠졌는지 확인한다 |
| 화면이 자꾸 꺼진다 | 저전력 모드를 끄고 기기 자동 잠금 시간을 '안 함'으로 바꾼다 |
| 화면이 멈췄다 | 페이지를 새로고침한다. 설정값은 유지된다 |
| 인터넷이 안 된다 | 정상이다. 미리 열어둔 탭이면 그대로 돌아간다 |

## 음원 교체

`audio/README.md` 참고.

## 개발자용

빌드 도구를 쓰지 않는다. 파일을 그대로 서빙한다.

    npm test                      # quiz.js 로직 테스트
    npx --yes serve -l 5173 .     # 로컬에서 띄우기

| 파일 | 책임 |
|---|---|
| `js/songs.js` | 곡 5개 데이터 |
| `js/quiz.js` | 덱 셔플, 보기 생성, 채점 (순수 함수) |
| `js/audio.js` | 음원 재생, 실패 시 데모음 합성 |
| `js/app.js` | 상태 기계, DOM, 타이머, 설정, Wake Lock |
| `sw.js` | 오프라인 캐시 |

색상을 바꾸려면 `css/style.css` 맨 위 `:root` 변수만 고치면 된다.

- 설계 문서: `docs/superpowers/specs/2026-09-09-uhd-house-song-quiz-design.md`
- 구현 계획: `docs/superpowers/plans/2026-09-09-uhd-house-song-quiz.md`
```

- [ ] **Step 3: 커밋**

```bash
git add README.md audio/README.md
git commit -m "docs: 현장 운영 매뉴얼과 음원 교체 안내

코드를 모르는 스태프가 부스에서 바로 쓸 수 있도록 당일 준비 절차,
설정 화면 여는 법, 증상별 대응표를 적었다. 경기장 가기 전 와이파이
있는 곳에서 페이지를 한 번 열어야 한다는 점을 가장 위에 뒀다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DD7X7FZzHaNdTkHHhdutUW"
```

---

### Task 10: GitHub 배포

**Files:**
- 없음 (배포 작업)

**Interfaces:**
- Consumes: Task 1~9 전체
- Produces: 사용자에게 전달할 GitHub Pages 주소

**배경:** 스펙 §12. `ROBINKIM0221` 계정에 public 레포를 만들고 Pages로 배포한다. gh CLI가 이미 로그인돼 있다.

- [ ] **Step 1: 전체 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 15개 테스트 통과

- [ ] **Step 2: 커밋되지 않은 변경이 없는지 확인**

Run: `git status --short`
Expected: 출력 없음

- [ ] **Step 3: public 레포 생성 및 푸시**

```bash
gh repo create uhd-house-song-quiz --public --source=. --remote=origin --description="울산 HD FC 프렌즈 장외 부스 - UHD 하우스에서 들려온 노래" --push
```

- [ ] **Step 4: GitHub Pages 활성화**

```bash
gh api -X POST repos/ROBINKIM0221/uhd-house-song-quiz/pages -f "source[branch]=main" -f "source[path]=/"
```

Expected: 201 응답. 이미 켜져 있으면 409가 나오는데 그때는 아래로 확인만 한다.

```bash
gh api repos/ROBINKIM0221/uhd-house-song-quiz/pages --jq .html_url
```

- [ ] **Step 5: 배포 확인**

Pages 빌드에 1~2분 걸린다. 아래로 200이 뜰 때까지 기다린다.

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://robinkim0221.github.io/uhd-house-song-quiz/
```

Expected: `200`

브라우저로 위 주소를 열어 대기 화면이 뜨고 한 판이 정상 진행되는지 확인한다.

- [ ] **Step 6: 남은 일 전달**

배포 주소를 사용자에게 알리고, 음원 5개가 도착하면 `audio/README.md` 절차대로
넣고 `CACHE_VERSION`을 올려 재배포해야 한다는 점을 함께 전달한다.

---

## 자가 점검

**스펙 커버리지**

| 스펙 항목 | 담당 태스크 |
|---|---|
| §2 범위 (팀 집계 제외) | 전체 — 어디에도 점수 저장이 없다 |
| §4.1 대기 화면 | Task 4, 6 |
| §4.2 재생 (15초, 재생 중 응답 가능) | Task 6 |
| §4.3 응답 (5초, 무응답=오답) | Task 6 |
| §4.4 결과 (곡명 공개, 12초 자동 복귀) | Task 6 |
| §4.5 숨은 설정 화면 | Task 4, 7 |
| §5 셔플·보기·채점 | Task 2, 3 |
| §6 곡 목록 | Task 1 |
| §6 음원 부재 시 데모음 | Task 5 |
| §7 디자인 (색, 반응형, 64px, Wake Lock) | Task 4, 7 |
| §8 파일 구조 | Task 1~9 (audio.js 분리 이유는 위에 명시) |
| §9 오프라인 캐시 | Task 8 |
| §10 오류 처리 5종 | Task 5(음원·재생차단), 7(Wake Lock·localStorage), 8(서비스워커) |
| §11 테스트 | Task 1, 2, 3 |
| §12 배포 | Task 10 |
| §13 남은 의존성 | Task 9(문서), Task 10 Step 6 |

**타입 일관성**

- `Song` 모양 `{ id, title, file }`은 Task 1에서 정의하고 2·3·5·6·7에서 같게 쓴다.
- `score()` 반환 `{ correct, points, timedOut }`은 Task 3에서 정의하고 Task 6에서 `result.correct` / `result.points`로 읽는다.
- `player.play()` 반환값 `'file' | 'demo' | 'silent'`는 Task 5에서 정의하고 Task 6에서 세 값 모두 처리한다.
- `player.probe()` 반환 `{ file, ok }`는 Task 5에서 정의하고 Task 7에서 `entry.ok`로 읽는다.
- `createDeck(songs, previousSongId, rand)`의 인자 순서는 Task 2 정의와 Task 6 호출이 일치한다.
- DOM id는 Task 4에서 한 번에 정의하고 Task 6·7이 그 목록에서만 가져온다.
