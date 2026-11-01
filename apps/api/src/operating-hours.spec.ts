import assert from 'node:assert/strict';
import test from 'node:test';
import { isWithinOperatingHours, WeeklyHours } from './operating-hours';

const weekdays: WeeklyHours = Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day => [day,{closed:false,opensAt:'09:00',closesAt:'21:00'}]));

test('evaluates weekly schedules using Pakistan local time', () => {
  assert.equal(isWithinOperatingHours(weekdays, new Date('2026-10-30T15:00:00Z')), true);
  assert.equal(isWithinOperatingHours(weekdays, new Date('2026-10-30T16:00:00Z')), false);
});

test('supports closed days and overnight opening hours', () => {
  const schedule = { ...weekdays, friday: { closed:false, opensAt:'22:00', closesAt:'02:00' }, saturday: { closed:true } };
  assert.equal(isWithinOperatingHours(schedule, new Date('2026-10-30T20:30:00Z')), true);
  assert.equal(isWithinOperatingHours(schedule, new Date('2026-10-31T04:00:00Z')), false);
});

test('treats unset merchant hours as schedule unrestricted', () => {
  assert.equal(isWithinOperatingHours(null, new Date('2026-10-30T02:00:00Z')), true);
});
