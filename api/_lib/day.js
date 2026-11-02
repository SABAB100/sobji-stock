// Daily fresh start: the shop's stock is per-day. Each calendar day
// (Bangladesh time, Asia/Dhaka) starts with every item's stock reset to 0,
// while the items themselves (name, unit, price) are kept, so the shop
// does not have to re-enter its vegetables and prices every day. The
// sales history is kept forever for per-day/month/year monitoring.
//
// The reset is lazy: it runs on the first stock read of a new day, so no
// cron job is needed. The first run after this ships only records the
// current day and does NOT change anything, so deploying mid-day is safe.
const { redis, hgetallToObject } = require('./store');

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

// If the stored stock day is older than today, reset every item's stock
// to 0 but keep the items (name, unit, price, id). Sales history is
// intentionally untouched.
async function ensureCurrentDay() {
  const today = todayDhaka();
  const stored = await redis('GET', 'stockDay');
  if (stored === today) return today;
  if (stored !== null && stored !== undefined) {
    const raw = hgetallToObject(await redis('HGETALL', 'items'));
    for (const [id, value] of Object.entries(raw)) {
      try {
        const item = JSON.parse(value);
        item.stock = 0;
        await redis('HSET', 'items', id, JSON.stringify(item));
      } catch (_) {
        // Keep an unreadable entry untouched rather than wiping it.
      }
    }
  }
  await redis('SET', 'stockDay', today);
  return today;
}

module.exports = { todayDhaka, ensureCurrentDay };
