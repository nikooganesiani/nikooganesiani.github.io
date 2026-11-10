import test from 'node:test';
import assert from 'node:assert/strict';
import { formatStudioDate, studioDateInstant, dateControl } from '../public/date-picker.js';

test('Studio dates always display day.month.year and 24-hour Tbilisi time',()=>{
  assert.equal(formatStudioDate('2026-11-10T18:08:00Z'),'10.11.2026 22:08');
  assert.equal(formatStudioDate('2026-11-10T22:30:00Z'),'11.11.2026 02:30');
  assert.equal(formatStudioDate('2026-11-10T00:00:00+04:00'),'10.11.2026 00:00');
  assert.equal(formatStudioDate(''),'');
});
test('Selected dates retain the explicit Tbilisi offset when saved and reopened',()=>{
  const value=studioDateInstant('2026-11-20','18','30');
  assert.equal(value,'2026-11-20T18:30:00+04:00');
  assert.equal(formatStudioDate(value),'20.11.2026 18:30');
  assert.equal(studioDateInstant('2026-11-20','0','5'),'2026-11-20T00:05:00+04:00');
});
test('Calendar rejects invalid days and AM/PM, out-of-range or malformed times',()=>{
  assert.ok(studioDateInstant('2028-02-29','23','59'));
  for(const args of [['2026-02-29','12','00'],['2026-11-10','24','00'],['2026-11-10','12','60'],['2026-11-10','-1','00'],['2026-11-10','10 PM','08'],['11/10/2026','10','08']]) assert.equal(studioDateInstant(...args),null);
});
test('Date controls use Studio’s calendar instead of the browser’s regional date picker',()=>{
  const markup=dateControl('Начало · Тбилиси','campaigns.0.startsAt','2026-11-10T22:08:00+04:00');
  assert.match(markup,/10\.11\.2026 22:08/);
  assert.match(markup,/aria-haspopup="dialog"/);
  assert.doesNotMatch(markup,/<input|datetime-local|AM|PM/);
  assert.match(dateControl('Начало','preview',''),/Выбрать дату и время/);
});
