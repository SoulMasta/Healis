const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Keep the allowlist conservative but practical for "основные форматы" (txt/docx/pptx/pdf/etc).
const ALLOWED_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.rtf',
  '.csv',
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.zip',
  '.rar',
  '.7z',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
]);

function fixMojibakeName(name) {
  const s = String(name || '');
  // Typical symptom: UTF-8 bytes mis-decoded as latin1 -> shows up as "Ð", "Ñ", etc.
  const looksMojibake = /[ÐÑ]/.test(s) && !/[А-Яа-яЁё]/.test(s);
  if (!looksMojibake) return s.normalize('NFC');
  try {
    return Buffer.from(s, 'latin1').toString('utf8').normalize('NFC');
  } catch {
    return s.normalize('NFC');
  }
}

function safeName(name) {
  // Avoid path traversal and weird characters in filenames.
  const base = fixMojibakeName(name || 'file')
    .replace(/[/\\]/g, '_')
    // Keep unicode letters/numbers (incl. Cyrillic), plus a small safe set of symbols.
    .replace(/[^\p{L}\p{N}_.\-()+\s]/gu, '')
    .trim();
  return base.length ? base : 'file';
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    try {
      const userId = req.user?.id;
      const deskId = req.params?.deskId;
      const uploadsRoot = path.join(__dirname, '..', 'uploads');
      const dest = path.join(uploadsRoot, String(userId || 'anon'), String(deskId || 'common'));
      fs.mkdirSync(dest, { recursive: true });
      cb(null, dest);
    } catch (e) {
      cb(e);
    }
  },
  filename(req, file, cb) {
    const fixedOriginal = fixMojibakeName(file.originalname || '');
    const ext = path.extname(fixedOriginal || '').toLowerCase();
    const token = crypto.randomBytes(8).toString('hex');
    const ts = Date.now();
    const base = safeName(path.basename(fixedOriginal || 'file', ext));
    cb(null, `${ts}-${token}-${base}${ext || ''}`);
  },
});

function fileFilter(req, file, cb) {
  const fixedOriginal = fixMojibakeName(file.originalname || '');
  const ext = path.extname(fixedOriginal || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(new Error(`Unsupported file type: ${ext || 'unknown'}`));
  }
  return cb(null, true);
}

// 25MB default cap for uploads
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 },
});

module.exports = {
  upload,
  ALLOWED_EXTENSIONS,
};


