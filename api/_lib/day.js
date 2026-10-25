// Daily fresh start: the shop's stock is per-day. Each calendar day
// (Bangladesh time, Asia/Dhaka) starts with an empty stock list, while
// the sales history is kept forever for per-day/month/year monitoring.
//
// The reset is lazy: it runs on the first stock read of a new day, so no
// cron job is needed. The first run after this ships only records the
// current day and does NOT wipe anything, so deploying mid-day is safe.
const { redis } = require('./store');

// Today's date (YYYY-MM-DD) in Bangladesh time.
function todayDhaka() {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch (_) {
    // Fallback: Bangladesh is UTC+6 all year (no daylight saving).
    const d = new Date(Date.now() + 6 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  }
}

// If the stored stock day is older than today, delete every item and
// record today. Sales history is intentionally untouched.
async function ensureCurrentDay() {
  const today = todayDhaka();
  const stored = await redis('GET', 'stockDay');
  if (stored === today) return today;
  if (stored !== null && stored !== undefined) {
    await redis('DEL', 'items');
  }
  await redis('SET', 'stockDay', today);
  return today;
}

module.exports = { todayDhaka, ensureCurrentDay };
