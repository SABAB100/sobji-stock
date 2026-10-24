// PUT /api/items/:id    -> edit a vegetable (name, price, or stock)
// DELETE /api/items/:id -> delete a vegetable
// Vercel maps this file to /api/items/<id> and puts <id> in req.query.id.
const { redis, hgetallToObject } = require('../_lib/store');
const { requireAuth } = require('../_lib/auth');
const {
  send,
  sendError,
  readBody,
  badRequest,
  notFound,
  toMinorUnits,
} = require('../_lib/http');

async function loadItem(id) {
  const raw = await redis('HGET', 'items', id);
  if (!raw) throw notFound('Vegetable not found.');
  return JSON.parse(raw);
}

module.exports = async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;
    const id = req.query && req.query.id;
    if (!id || Array.isArray(id)) throw badRequest('Missing item id.');
    const item = await loadItem(id);

    if (req.method === 'PUT') {
      const body = await readBody(req);
      if (body.name !== undefined) {
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name) throw badRequest('Vegetable name is required.');
        item.name = name;
      }
      if (body.price !== undefined) {
        if (body.price === null || body.price === '') {
          item.price = null;
        } else {
          const price = Number(body.price);
          if (!Number.isFinite(price) || price < 0) {
            throw badRequest('Price must be a number of 0 or more.');
          }
          item.price = price;
        }
      }
      if (body.qty !== undefined) {
        item.stock = toMinorUnits(item.unit, body.qty, body.qtyUnit);
      }
      await redis('HSET', 'items', item.id, JSON.stringify(item));
      return send(res, 200, { item });
    }

    if (req.method === 'DELETE') {
      await redis('HDEL', 'items', item.id);
      return send(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'PUT, DELETE');
    return send(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    return sendError(res, err);
  }
};
