// /api/sales
//   GET    -> recent sales, newest first (max 100, or all with ?all=1
//             so the frontend month filter can look back at older months).
//   DELETE -> delete one sale by id (body: { id }) and add the sold
//             quantity back to that vegetable's stock, so the books
//             stay correct. The history entry is removed from the Redis
//             list with LREM using the exact stored string (count 1).
//             Fallbacks: entries made before `amount` was stored are
//             restored by parsing qtyText ("500 g" -> 500 g, "0.5 kg" ->
//             500 g, "2 pcs" -> 2 pieces). If the quantity cannot be
//             parsed, or the vegetable no longer exists, only the record
//             is deleted and the response says stock was not restored.
const { redis } = require('./_lib/store');
const { send, sendError, readBody, badRequest, notFound } = require('./_lib/http');
const { requireAuth } = require('./_lib/auth');

// Parse an old-format sale's qtyText into minor units (grams / pieces).
// Returns null when the text cannot be parsed.
function parseQtyText(qtyText) {
  if (typeof qtyText !== 'string') return null;
  const m = qtyText.trim().match(/^([\d.]+)\s*(kg|g|pcs?|pieces?)$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2].toLowerCase();
  if (unit === 'kg') return Math.round(n * 1000);
  return Math.round(n); // 'g' -> grams as-is; 'pcs'/'pc' -> pieces as-is
}

async function handleDelete(req, res) {
  const body = await readBody(req);
  if (!body.id || typeof body.id !== 'string') {
    throw badRequest('Missing sale id.');
  }
  const rawList = await redis('LRANGE', 'sales', 0, -1);
  const list = Array.isArray(rawList) ? rawList : [];
  let index = -1;
  let sale = null;
  for (let i = 0; i < list.length; i++) {
    try {
      const parsed = JSON.parse(list[i]);
      if (parsed && parsed.id === body.id) {
        index = i;
        sale = parsed;
        break;
      }
    } catch (_) {
      // Skip unparseable entries; they are not the one being deleted.
    }
  }
  if (index === -1) throw notFound('Sale not found.');

  // Remove exactly that one entry, using the exact stored string.
  const removed = await redis('LREM', 'sales', 1, list[index]);
  if (!removed) throw notFound('Sale not found.');

  // Restore the sold quantity to stock when possible.
  let amount = null;
  if (typeof sale.amount === 'number' && Number.isFinite(sale.amount) && sale.amount > 0) {
    amount = Math.round(sale.amount);
  } else {
    amount = parseQtyText(sale.qtyText);
  }
  let stockRestored = false;
  if (amount !== null && sale.itemId) {
    const rawItem = await redis('HGET', 'items', sale.itemId);
    if (rawItem) {
      const item = JSON.parse(rawItem);
      item.stock += amount;
      await redis('HSET', 'items', item.id, JSON.stringify(item));
      stockRestored = true;
    }
    // Vegetable no longer exists: record deleted, stock untouched.
  }
  return send(res, 200, { deleted: true, stockRestored, restoredAmount: stockRestored ? amount : null });
}

module.exports = async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;
    if (req.method === 'GET') {
      // ?all=1 lifts the 100-entry cap so the month filter in the
      // frontend can look back at older months too.
      let all = false;
      try {
        all = new URL(req.url, 'http://localhost').searchParams.get('all') === '1';
      } catch (_) { /* keep default */ }
      const raw = await redis('LRANGE', 'sales', 0, all ? -1 : 99);
      const sales = (Array.isArray(raw) ? raw : [])
        .map((v) => {
          try {
            return JSON.parse(v);
          } catch (_) {
            return null;
          }
        })
        .filter(Boolean);
      return send(res, 200, { sales });
    }
    if (req.method === 'DELETE') {
      // NOTE: `return await`, not bare `return` — a bare return of the
      // promise would let handleDelete's rejections (404/400) escape
      // this try/catch instead of becoming JSON error responses.
      return await handleDelete(req, res);
    }
    res.setHeader('Allow', 'GET, DELETE');
    return send(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    return sendError(res, err);
  }
};
