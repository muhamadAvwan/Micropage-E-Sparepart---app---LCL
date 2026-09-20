// Pembatas percobaan login sederhana berbasis memori (tanpa dependency).
// Kunci = IP + username, sehingga satu akun yang di-brute force akan terkunci
// tanpa mengganggu pengguna lain.

const WINDOW_MS = 15 * 60 * 1000; // jendela hitung 15 menit
const MAX_ATTEMPTS = 5;           // maksimal 5 kegagalan

const attempts = new Map();

function clientIp(req) {
  const fwd = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
}

function keyOf(req) {
  const username = String((req.body && req.body.username) || '').toLowerCase();
  return clientIp(req) + '|' + username;
}

function loginRateLimit(req, res, next) {
  const key = keyOf(req);
  const now = Date.now();
  const entry = attempts.get(key);

  if (entry && now < entry.resetAt && entry.count >= MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      status: 'error',
      message: 'Terlalu banyak percobaan login. Coba lagi dalam ' + Math.ceil(retryAfter / 60) + ' menit.',
      retryAfter,
    });
  }

  if (entry && now >= entry.resetAt) attempts.delete(key);
  req.loginKey = key;
  return next();
}

function registerLoginFailure(req) {
  const key = req.loginKey || keyOf(req);
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now >= entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

function clearLoginFailures(req) {
  const key = req.loginKey || keyOf(req);
  attempts.delete(key);
}

// Bersihkan entri kedaluwarsa secara berkala; unref agar tidak menahan proses.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attempts) {
    if (now >= entry.resetAt) attempts.delete(key);
  }
}, WINDOW_MS);
if (sweeper.unref) sweeper.unref();

module.exports = { loginRateLimit, registerLoginFailure, clearLoginFailures };
