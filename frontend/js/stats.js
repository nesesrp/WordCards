// Daily streak and activity calculations.
// activity: { "2026-10-02": 15, ... } → number of reviews done on that day

export function dateKey(ts = Date.now()) {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function addDays(ts, n) {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

// If nothing has been studied yet today, the streak is counted from yesterday
// so it doesn't look "broken" in the middle of the day.
export function currentStreak(activity, now = Date.now()) {
  let day = activity[dateKey(now)] ? now : addDays(now, -1);
  let streak = 0;
  while (activity[dateKey(day)]) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

export function longestStreak(activity) {
  const keys = Object.keys(activity).filter((k) => activity[k] > 0).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const key of keys) {
    run = prev && dateKey(addDays(prev, 1)) === key ? run + 1 : 1;
    best = Math.max(best, run);
    prev = new Date(`${key}T00:00`).getTime();
  }
  return best;
}

export function lastNDays(activity, n, now = Date.now()) {
  return Array.from({ length: n }, (_, i) => {
    const ts = addDays(now, i - (n - 1));
    return {
      key: dateKey(ts),
      count: activity[dateKey(ts)] || 0,
      label: new Date(ts).toLocaleDateString('tr-TR', { weekday: 'short' }),
    };
  });
}
