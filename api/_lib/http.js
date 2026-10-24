// Small helpers shared by the API routes (Vercel Node serverless functions).

function send(res, status, obj) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

function sendError(res, err) {
  const status = err && Number.isInteger(err.status) ? err.status : 500;
  send(res, status, { error: (err && err.message) || 'Internal server error' });
}

// Read a JSON request body. Returns {} for an empty body.
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (_) {
        reject(Object.assign(new Error('Invalid JSON body'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function notFound(message) {
  return Object.assign(new Error(message || 'Not found'), { status: 404 });
}

// Stock is stored in exact integer "minor units" so gram math never drifts:
//   - kg items: grams (1 kg = 1000 g). A 100 g sale deducts exactly 100.
//   - piece items: whole pieces.
// Convert a user-entered quantity into minor units.
function toMinorUnits(unit, qty, qtyUnit) {
  const n = Number(qty);
  if (!Number.isFinite(n) || n < 0) {
    throw badRequest('Quantity must be a number of 0 or more.');
  }
  if (unit === 'kg') {
    if (qtyUnit === 'kg') return Math.round(n * 1000);
    if (qtyUnit === 'g') return Math.round(n);
    throw badRequest('For kg items, quantity unit must be kg or g.');
  }
  if (unit === 'piece') {
    if (qtyUnit !== 'piece') throw badRequest('For piece items, quantity unit must be piece.');
    if (!Number.isInteger(n)) throw badRequest('Piece quantity must be a whole number.');
    return n;
  }
  throw badRequest('Unit must be kg or piece.');
}

// Human-readable stock text, e.g. 39650 g -> "39.65 kg", 500 g -> "500 g".
function formatMinor(item) {
  if (item.unit === 'piece') {
    return item.stock === 1 ? '1 pc' : `${item.stock} pcs`;
  }
  const g = item.stock;
  if (g >= 1000) {
    const kg = g / 1000;
    const text = Number.isInteger(kg) ? String(kg) : String(Math.round(kg * 1000) / 1000);
    return `${text} kg`;
  }
  return `${g} g`;
}

function isLow(item) {
  return item.stock > 0 && item.stock <= (item.unit === 'kg' ? 5000 : 5);
}

function isFinished(item) {
  return item.stock === 0;
}

module.exports = {
  send,
  sendError,
  readBody,
  badRequest,
  notFound,
  toMinorUnits,
  formatMinor,
  isLow,
  isFinished,
};
