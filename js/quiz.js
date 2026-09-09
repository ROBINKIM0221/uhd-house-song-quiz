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
