import { useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';

const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

function computeStreak(days) {
  let streak = 0;
  const d = new Date();
  // Count back from today while each day has any activity.
  // Allow today to be empty (streak continues from yesterday) only if yesterday active.
  for (let i = 0; i < 400; i++) {
    const key = dayKey(d);
    const day = days[key];
    const active = day && (day.minutes > 0 || day.pomodoros > 0);
    if (active) streak += 1;
    else if (i === 0) { /* today empty — keep checking yesterday */ }
    else break;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export function useReadingStats() {
  const [stats, setStats] = useLocalStorage('bookshelf.stats', { days: {} });

  const bump = useCallback((field, amount) => {
    setStats((s) => {
      const key = dayKey();
      const day = s.days[key] || { minutes: 0, pomodoros: 0 };
      return { ...s, days: { ...s.days, [key]: { ...day, [field]: (day[field] || 0) + amount } } };
    });
  }, [setStats]);

  const addMinutes = useCallback((m = 1) => bump('minutes', m), [bump]);
  const addPomodoro = useCallback(() => bump('pomodoros', 1), [bump]);

  const today = stats.days[dayKey()] || { minutes: 0, pomodoros: 0 };
  const streak = computeStreak(stats.days || {});

  return { today, streak, addMinutes, addPomodoro };
}
