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
    /**
     * onEnded는 음원 파일이 끝까지 재생됐을 때만 부른다. 데모음에는
     * 붙이지 않는다. 데모음은 3초도 안 되는 전자음이라, 그걸로 곡이
     * 끝났다고 치면 음원이 빠졌을 때 문제가 3초 만에 끝나버린다.
     */
    async play(file, onEnded) {
      this.stop();
      try {
        element.src = file;
        element.currentTime = 0;
        await element.play();
        element.onended = () => onEnded?.();
        return 'file';
      } catch {
        // 파일이 없거나(404) 디코딩에 실패했거나 브라우저가 막았다.
        // 어느 쪽이든 데모음으로 넘어간다.
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

    async probe(files) {
      return Promise.all(
        files.map(async (file) => {
          // 캐시를 먼저 본다. 오프라인에서는 네트워크 요청이 실패하는데,
          // 캐시에 있으면 실제로 그 파일이 재생되므로 '정상'이 맞다.
          // 네트워크만 보면 경기장에서 5곡 전부 '없음'이라고 거짓말한다.
          try {
            if ('caches' in window) {
              const hit = await caches.match(file);
              if (hit) return { file, ok: true };
            }
          } catch {
            // 캐시를 못 열었다. 네트워크로 확인한다.
          }

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
