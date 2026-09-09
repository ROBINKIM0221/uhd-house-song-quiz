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
