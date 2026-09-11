// 음원 재생.
//
// 음원을 오디오 요소에 URL로 물리지 않고, 미리 fetch 로 통째로 받아
// 메모리에 올려둔 뒤 그것을 재생한다. 이유가 둘이다.
//
// 첫째, 오디오 요소는 파일을 조각내서(Range) 요청하는데 서비스워커 캐시에는
// 통짜 응답만 들어 있다. 온라인에서는 네트워크가 조각 요청을 받아주니 드러나지
// 않지만, 오프라인에서는 그 요청이 캐시와 맞지 않아 음원이 통째로 빠졌다.
// fetch 는 조각 요청을 쓰지 않으므로 캐시에서 그대로 꺼내진다.
//
// 둘째, 미리 받아두면 [시작하기]를 누른 순간 기다림 없이 재생이 시작된다.
// iOS는 사용자가 누른 그 순간에 재생이 걸려야 자동재생 차단을 통과하는데,
// 누른 뒤에 파일을 받아오면 그 사이에 조건이 풀린다.
//
// 파일이 없으면 Web Audio 로 합성한 데모음으로 대체한다. 당일 파일이 하나
// 빠져도 부스가 멈추면 안 된다.

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

  // 파일 경로 -> 메모리에 올려둔 음원 주소
  const loaded = new Map();
  // 파일 경로 -> 왜 못 올렸는지
  const loadErrors = new Map();
  let lastPlayError = null;

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
    /**
     * 음원을 전부 받아 메모리에 올린다. 시작할 때 한 번, 그리고 설정 화면을
     * 열 때마다 실패한 것만 다시 시도한다. 여러 번 불러도 안전하다.
     */
    async preload(files) {
      await Promise.all(
        files.map(async (file) => {
          if (loaded.has(file)) return;
          try {
            const response = await fetch(file);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            loaded.set(file, URL.createObjectURL(await response.blob()));
            loadErrors.delete(file);
          } catch (error) {
            loadErrors.set(file, String(error));
            console.warn(`[음원] 불러오기 실패: ${file}`, error);
          }
        }),
      );
      return this.status(files);
    },

    /** 설정 화면의 음원 상태 표시용. 네트워크를 건드리지 않는다. */
    status(files) {
      return files.map((file) => ({
        file,
        ok: loaded.has(file),
        error: loadErrors.get(file) ?? null,
      }));
    },

    /** 마지막 재생 실패 사유. 데모음이 나는데 이유를 모르면 현장에서 손쓸 수 없다. */
    lastError() {
      return lastPlayError;
    },

    /**
     * onEnded는 음원이 끝까지 재생됐을 때만 부른다. 데모음에는 붙이지 않는다.
     * 데모음은 3초도 안 되는 전자음이라, 그걸로 곡이 끝났다고 치면 음원이
     * 빠졌을 때 문제가 3초 만에 끝나버린다.
     */
    async play(file, onEnded) {
      this.stop();

      // 페이지를 열자마자 누르면 아직 다 못 받았을 수 있다. 그때 바로
      // 데모음으로 떨어뜨리지 않고, 한 번 받아본 뒤 그래도 없으면 원래
      // 주소로라도 재생을 시도한다. 온라인이면 그쪽이 데모음보다 낫다.
      let src = loaded.get(file);
      if (!src) {
        await this.preload([file]);
        src = loaded.get(file) ?? file;
      }

      try {
        element.src = src;
        element.currentTime = 0;
        await element.play();
        element.onended = () => onEnded?.();
        lastPlayError = null;
        return 'file';
      } catch (error) {
        lastPlayError = String(error);
        console.warn(`[음원] 재생 실패: ${file}`, error);
        return playDemo(file) ? 'demo' : 'silent';
      }
    },

    stop() {
      // 먼저 떼어낸다. 멈춘 뒤에 뒤늦게 불려서 다음 문제를 건드리면 안 된다.
      element.onended = null;
      try {
        element.pause();
      } catch {
        // 아직 재생한 적이 없다. 무시한다.
      }
      stopDemo();
    },
  };
}
