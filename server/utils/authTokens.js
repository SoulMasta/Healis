const crypto = require('crypto');

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

module.exports = {
  randomToken,
  hashToken,
};


