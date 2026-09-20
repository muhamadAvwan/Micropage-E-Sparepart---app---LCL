const crypto = require('crypto');

// Format hash: scrypt$<saltHex>$<hashHex>
// Menggunakan scrypt bawaan Node sehingga tidak perlu dependency tambahan.
const PREFIX = 'scrypt';
const KEYLEN = 64;

function isHashed(value) {
  return typeof value === 'string' && value.startsWith(PREFIX + '$');
}

function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(plain), salt, KEYLEN);
  return PREFIX + '$' + salt.toString('hex') + '$' + derived.toString('hex');
}

/**
 * Verifikasi password terhadap nilai tersimpan.
 * - Jika tersimpan sebagai hash scrypt -> bandingkan hash.
 * - Jika masih plaintext (data lama) -> bandingkan langsung, dan tandai
 *   `needsUpgrade` agar controller bisa menyimpan ulang dalam bentuk hash.
 * @returns {{ ok: boolean, needsUpgrade: boolean }}
 */
function verifyPassword(plain, stored) {
  const st = stored == null ? '' : String(stored);
  const input = Buffer.from(String(plain));

  if (!isHashed(st)) {
    const saved = Buffer.from(st);
    if (input.length !== saved.length) return { ok: false, needsUpgrade: false };
    return { ok: crypto.timingSafeEqual(input, saved), needsUpgrade: true };
  }

  const parts = st.split('$');
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const derived = crypto.scryptSync(String(plain), salt, expected.length);
  const ok = derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  return { ok, needsUpgrade: false };
}

module.exports = { hashPassword, verifyPassword, isHashed };
