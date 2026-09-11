import { SONGS } from './songs.js';
import { createDeck, createChoices, score } from './quiz.js';
import { createPlayer } from './audio.js';

const DEFAULTS = { playSeconds: 15, answerSeconds: 5 };
const RESULT_AUTO_RESET_MS = 12000;
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

const el = (id) => document.getElementById(id);

const dom = {
  screens: {
    idle: el('screen-idle'),
    quiz: el('screen-quiz'),
    result: el('screen-result'),
  },
  hint: el('hint'),
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
  logo: el('logo'),
  overlay: el('overlay-settings'),
  settingPlay: el('setting-play'),
  settingPlayValue: el('setting-play-value'),
  settingAnswer: el('setting-answer'),
  settingAnswerValue: el('setting-answer-value'),
  audioStatus: el('setting-audio-status'),
  btnRefreshCache: el('btn-refresh-cache'),
  btnCloseSettings: el('btn-close-settings'),
};

const player = createPlayer();

const state = {
  settings: loadSettings(),
  // 'idle' | 'playing' | 'answering' | 'result'
  phase: 'idle',
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

/** 안내 문구의 초를 설정값과 맞춘다. 스태프가 재생 길이를 10초로 줄이면
    문구도 10초라고 말해야 한다. */
function renderHint() {
  dom.hint.textContent =
    `응원가를 듣고 ${state.settings.playSeconds}초가 끝나기 전에 어떤 곡인지 맞혀보세요!`;
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
  state.phase = 'idle';
  state.currentSong = null;
  state.answered = false;
  showScreen('idle');
}

// --- playing ----------------------------------------------------------

async function startQuestion() {
  clearTimers();
  state.phase = 'playing';
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
  const mode = await player.play(state.currentSong.file, handleAudioEnded);

  // 재생을 기다리는 동안 참가자가 이미 답했거나 대기 화면으로
  // 돌아갔을 수 있다. 그러면 타이머를 새로 걸지 않는다.
  if (state.answered || state.currentSong === null) return;

  if (mode === 'demo') dom.demoBadge.hidden = false;
  if (mode === 'silent') dom.audioWarning.hidden = false;

  countdownPlay(state.settings.playSeconds);
}

/**
 * 음원이 재생 길이보다 짧게 끝났다. 남은 시간 동안 무음을 흘리지 않고
 * 곧바로 응답 단계로 넘긴다. 응원가가 모두 15~16초짜리라, 설정에서
 * 재생 길이를 그보다 늘리면 뒤에 정적이 남는다.
 */
function handleAudioEnded() {
  if (state.phase !== 'playing') return;
  startAnswering();
}

function countdownPlay(remaining) {
  if (state.phase !== 'playing') return;
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
  state.phase = 'answering';
  dom.playTimer.hidden = true;
  dom.answerTimer.hidden = false;
  countdownAnswer(state.settings.answerSeconds);
}

function countdownAnswer(remaining) {
  if (state.phase !== 'answering') return;
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
  state.phase = 'result';
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
  renderHint();
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

// --- 연결 -------------------------------------------------------------

dom.btnStart.addEventListener('click', startQuestion);
dom.btnNext.addEventListener('click', goIdle);

renderHint();
goIdle();

// --- 오프라인 캐시 ----------------------------------------------------

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // updateViaCache: 'none' 이 없으면 GitHub Pages가 sw.js에 붙이는
    // max-age=600 탓에 브라우저가 10분 동안 새 워커를 받아오지 않는다.
    // 등록에 실패해도 온라인이면 정상 동작한다. 콘솔에만 남긴다.
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch((error) => {
      console.warn('서비스워커 등록 실패:', error);
    });
  });
}
