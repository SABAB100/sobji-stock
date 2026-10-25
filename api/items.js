// GET /api/items  -> list all vegetables (starts a fresh day first:
//   if the stored stock day is older than today in Bangladesh time,
//   yesterday's items are cleared and today starts empty; sales
//   history is kept)
// POST /api/items -> add a vegetable
//   Body: { name, unit: "kg" | "piece", qty, qtyUnit: "kg" | "g" | "piece",
//           price?: number | null }  (price is per kg or per piece, optional)
const { redis, hgetallToObject } = require('./_lib/store');
const { requireAuth } = require('./_lib/auth');
const { ensureCurrentDay } = require('./_lib/day');
const {
  send,
  sendError,
  readBody,
  badRequest,
  toMinorUnits,
} = require('./_lib/http');

async function listItems() {
  const raw = hgetallToObject(await redis('HGETALL', 'items'));
  const items = Object.values(raw)
    .map((v) => {
      try {
        return JSON.parse(v);
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return items;
}

module.exports = async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;
    if (req.method === 'GET') {
      await ensureCurrentDay();
      return send(res, 200, { items: await listItems() });
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) throw badRequest('Vegetable name is required.');
      if (body.unit !== 'kg' && body.unit !== 'piece') {
        throw badRequest('Unit must be kg or piece.');
      }
      const stock = toMinorUnits(body.unit, body.qty, body.qtyUnit);
      let price = null;
      if (body.price !== undefined && body.price !== null && body.price !== '') {
        price = Number(body.price);
        if (!Number.isFinite(price) || price < 0) {
          throw badRequest('Price must be a number of 0 or more.');
        }
      }
      const item = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        unit: body.unit,
        stock,
        price,
        createdAt: Date.now(),
      };
      await redis('HSET', 'items', item.id, JSON.stringify(item));
      return send(res, 201, { item });
    }
    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    return sendError(res, err);
  }
};

module.exports.listItems = listItems;
