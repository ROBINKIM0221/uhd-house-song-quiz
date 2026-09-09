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
