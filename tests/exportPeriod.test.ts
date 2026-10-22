import test from 'node:test';
import assert from 'node:assert/strict';
import { filterByPeriod } from '../src/lib/exportPeriod';

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 9, 22);

test('filters readings to the selected rolling week, month, and year', () => {
  const timestamps = [now - 6 * DAY_MS, now - 8 * DAY_MS, now - 29 * DAY_MS, now - 31 * DAY_MS, now - 364 * DAY_MS, now - 366 * DAY_MS];
  const readings = timestamps.map((t) => ({ t }));

  assert.deepEqual(filterByPeriod(readings, (reading) => reading.t, 'week', now).map(({ t }) => t), [timestamps[0]]);
  assert.deepEqual(filterByPeriod(readings, (reading) => reading.t, 'month', now).map(({ t }) => t), [timestamps[0], timestamps[1], timestamps[2]]);
  assert.deepEqual(filterByPeriod(readings, (reading) => reading.t, 'year', now).map(({ t }) => t), timestamps.slice(0, 5));
  assert.equal(filterByPeriod(readings, (reading) => reading.t, 'all', now).length, timestamps.length);
});

test('excludes future records from a dated export', () => {
  const readings = [{ t: now + DAY_MS }];

  assert.deepEqual(filterByPeriod(readings, (reading) => reading.t, 'week', now), []);
});
