const assert = require('node:assert/strict');
const { nextBossSpawnDate } = require('./boss_schedule');
const before = nextBossSpawnDate(new Date('2026-11-17T15:00:00.000Z'));
assert.equal(before.toISOString(), '2026-11-17T18:00:00.000Z'); // 21:00 İstanbul aynı gün
const after = nextBossSpawnDate(new Date('2026-11-17T19:00:00.000Z'));
assert.equal(after.toISOString(), '2026-11-18T18:00:00.000Z'); // 21:00 geçildiyse ertesi gün
console.log('Boss zamanlama testi başarılı: Europe/Istanbul 21:00.');
