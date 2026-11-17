'use strict';

function nextBossSpawnDate(now = new Date(), timeZone = 'Europe/Istanbul', hour = 21, minute = 0) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const localAsUtc = Date.UTC(
    Number(values.year), Number(values.month) - 1, Number(values.day),
    Number(values.hour), Number(values.minute), Number(values.second)
  );
  const offsetMs = localAsUtc - now.getTime();
  const candidateLocal = new Date(Date.UTC(
    Number(values.year), Number(values.month) - 1, Number(values.day), hour, minute, 0
  ));
  if (candidateLocal.getTime() <= localAsUtc) candidateLocal.setUTCDate(candidateLocal.getUTCDate() + 1);
  return new Date(candidateLocal.getTime() - offsetMs);
}

module.exports = { nextBossSpawnDate };
