// POST /api/sell -> record a sale and deduct it from stock
//   Body: { id, qty, qtyUnit: "kg" | "g" | "piece" }
//   - Gram math is exact: stock is stored in grams, so a 100 g sale
//     deducts exactly 100 g (0.1 kg), never rounded up.
//   - A sale larger than the remaining stock is rejected (400).
//   - The sale is appended to the sales history.
const { redis } = require('./_lib/store');
const { requireAuth } = require('./_lib/auth');
const {
  send,
  sendError,
  readBody,
  badRequest,
  notFound,
  toMinorUnits,
  formatMinor,
} = require('./_lib/http');

module.exports = async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return send(res, 405, { error: 'Method not allowed' });
    }
    const body = await readBody(req);
    if (!body.id) throw badRequest('Missing item id.');
    const raw = await redis('HGET', 'items', body.id);
    if (!raw) throw notFound('Vegetable not found.');
    const item = JSON.parse(raw);

    const amount = toMinorUnits(item.unit, body.qty, body.qtyUnit);
    if (amount <= 0) throw badRequest('Sale quantity must be more than 0.');
    if (amount > item.stock) {
      const err = badRequest(
        `That is more than you have — only ${formatMinor(item)} left.`
      );
      err.left = formatMinor(item);
      return send(res, 400, { error: err.message, left: err.left });
    }

    item.stock -= amount;
    await redis('HSET', 'items', item.id, JSON.stringify(item));

    // Total price, only when a price is set (price is per kg or per piece).
    let totalPrice = null;
    if (item.price !== null && item.price !== undefined) {
      const units = item.unit === 'kg' ? amount / 1000 : amount;
      totalPrice = Math.round(units * item.price * 100) / 100;
    }

    const sale = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      itemId: item.id,
      itemName: item.name,
      qtyText:
        item.unit === 'kg'
          ? body.qtyUnit === 'kg'
            ? `${body.qty} kg`
            : `${body.qty} g`
          : `${body.qty} pcs`,
      totalPrice,
      at: Date.now(),
    };
    await redis('LPUSH', 'sales', JSON.stringify(sale));
    await redis('LTRIM', 'sales', 0, 199);

    return send(res, 200, { item, sale, left: formatMinor(item) });
  } catch (err) {
    return sendError(res, err);
  }
};
