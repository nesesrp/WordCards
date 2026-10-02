// Spaced repetition (Leitner box system).
// Every card lives in a "box". Each correct answer moves it up one box so it is
// asked less often; a wrong answer sends it back to the first box and it is
// asked again right away.

const DAY = 24 * 60 * 60 * 1000;

// Days until the next review, indexed by box number.
export const INTERVALS = [0, 1, 3, 7, 16, 35];

// A card that reaches this box counts as "learned".
export const LEARNED_BOX = 3;

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function newCardFields(now = Date.now()) {
  return { box: 0, due: now, reviews: 0, lapses: 0, lastReviewed: null };
}

export function review(card, knew, now = Date.now()) {
  const box = knew ? Math.min(card.box + 1, INTERVALS.length - 1) : 0;
  const due = knew ? startOfDay(now) + INTERVALS[box] * DAY : now;
  return {
    ...card,
    box,
    due,
    reviews: card.reviews + 1,
    lapses: card.lapses + (knew ? 0 : 1),
    lastReviewed: now,
  };
}

export const isDue = (card, now = Date.now()) => card.due <= now;
export const isLearned = (card) => card.box >= LEARNED_BOX;

export function dueLabel(card, now = Date.now()) {
  if (isDue(card, now)) return 'Bugün';
  const days = Math.round((startOfDay(card.due) - startOfDay(now)) / DAY);
  return days === 1 ? 'Yarın' : `${days} gün sonra`;
}
