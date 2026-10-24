// GET /api/sales -> recent sales, newest first (max 100).
const { redis } = require('./_lib/store');
const { send, sendError } = require('./_lib/http');
const { requireAuth } = require('./_lib/auth');

module.exports = async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return send(res, 405, { error: 'Method not allowed' });
    }
    const raw = await redis('LRANGE', 'sales', 0, 99);
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
  } catch (err) {
    return sendError(res, err);
  }
};
