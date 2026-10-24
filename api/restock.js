// POST /api/restock -> add stock to a vegetable
//   Body: { id, qty, qtyUnit: "kg" | "g" | "piece" }
//   Uses the same exact gram math as sales: 1000 g = 1 kg.
const { redis } = require('./_lib/store');
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
    if (amount <= 0) throw badRequest('Restock quantity must be more than 0.');
    item.stock += amount;
    await redis('HSET', 'items', item.id, JSON.stringify(item));
    return send(res, 200, { item, left: formatMinor(item) });
  } catch (err) {
    return sendError(res, err);
  }
};
