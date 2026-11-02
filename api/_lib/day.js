// Daily behavior: nothing is cleared or reset automatically. Items,
// prices and stocks stay exactly as the shop entered them, and the shop
// updates stock manually. The sales history is kept forever.
//
// ensureCurrentDay is kept as a compatibility no-op for callers: it only
// records the current day (Bangladesh time, Asia/Dhaka) and never touches
// items or sales.
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

// No automatic reset: just record today. Items, prices, stocks and sales
// history are all left untouched.
async function ensureCurrentDay() {
  const today = todayDhaka();
  const stored = await redis('GET', 'stockDay');
  if (stored !== today) {
    await redis('SET', 'stockDay', today);
  }
  return today;
}

module.exports = { todayDhaka, ensureCurrentDay };
