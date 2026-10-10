import { Router } from 'express';
import { currentStreak, longestStreak, dateKey } from '../../../frontend/js/stats.js';
import { addActivity, getActivity } from '../db.js';
import { HttpError, body } from '../validate.js';

export default function statsRouter(db) {
  const router = Router();

  router.get('/stats', (req, res) => {
    const activity = getActivity(db);
    res.json({
      activity,
      today: activity[dateKey()] || 0,
      currentStreak: currentStreak(activity),
      longestStreak: longestStreak(activity),
    });
  });

  // Counts practice answers, finished reading texts and podcast episodes
  // towards today's activity. Body: { count?: number } (default 1)
  router.post('/activity', (req, res) => {
    const { count = 1 } = body(req);
    if (!Number.isInteger(count) || count < 1) throw new HttpError(400, '"count" pozitif bir tam sayı olmalı.');
    const day = dateKey();
    addActivity(db, day, count);
    res.json({ day, count: getActivity(db)[day] });
  });

  return router;
}
