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

test('음원 경로는 audio/ 아래의 로마자 m4a다', () => {
  for (const song of SONGS) {
    assert.match(song.file, /^audio\/0[1-5]-[a-z]+\.m4a$/);
  }
});
