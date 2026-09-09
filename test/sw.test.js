import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SONGS } from '../js/songs.js';

// sw.js는 서비스워커라 js/songs.js를 import 할 수 없어 음원 경로를 따로
// 적어둔다. 그 목록이 곡 데이터와 어긋나면 해당 곡만 조용히 캐시에서
// 빠져 경기장에서 데모음이 난다. 그걸 여기서 막는다.
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

test('sw.js의 음원 사전 캐시 목록이 songs.js와 정확히 일치한다', () => {
  const block = sw.match(/const AUDIO_PRECACHE = \[([\s\S]*?)\];/);
  assert.ok(block, 'AUDIO_PRECACHE 목록을 찾지 못했다');
  const listed = [...block[1].matchAll(/'\.\/(.+?)'/g)].map((m) => m[1]);
  assert.deepEqual(listed, SONGS.map((s) => s.file));
});

test('음원은 PRECACHE가 아니라 AUDIO_PRECACHE에 있어야 한다', () => {
  // PRECACHE는 addAll이라 하나라도 없으면 설치가 통째로 실패한다.
  const block = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
  assert.ok(block, 'PRECACHE 목록을 찾지 못했다');
  assert.ok(!block[1].includes('audio/'), 'PRECACHE에 음원이 들어가면 안 된다');
});
