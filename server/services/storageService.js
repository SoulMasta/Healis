const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const stream = require('stream');
const { promisify } = require('util');

const pipeline = promisify(stream.pipeline);

const YC_ENDPOINT = process.env.YC_ENDPOINT || 'https://storage.yandexcloud.net';
const YC_REGION = process.env.YC_REGION || 'ru-central1';
const YC_BUCKET = process.env.YC_BUCKET_NAME || process.env.YC_BUCKET || 'healis-storage';
const YC_ACCESS_KEY = process.env.YC_ACCESS_KEY;
const YC_SECRET_KEY = process.env.YC_SECRET_KEY;
const USE_PRIVATE = String(process.env.YC_PRIVATE_BUCKET || 'true') === 'true';

if (!YC_ACCESS_KEY || !YC_SECRET_KEY) {
  console.warn('Yandex Cloud credentials are not set (YC_ACCESS_KEY / YC_SECRET_KEY). Storage service will fail until configured.');
}

const s3 = new S3Client({
  endpoint: YC_ENDPOINT,
  region: YC_REGION,
  credentials: YC_ACCESS_KEY && YC_SECRET_KEY ? { accessKeyId: YC_ACCESS_KEY, secretAccessKey: YC_SECRET_KEY } : undefined,
  forcePathStyle: false,
});

async function uploadFile(bufferOrStream, key, mimeType, opts = {}) {
  const maxAttempts = typeof opts.retries === 'number' ? opts.retries : 3;
  const baseDelay = 300;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const input = {
        Bucket: YC_BUCKET,
        Key: key,
        Body: bufferOrStream,
        ContentType: mimeType || 'application/octet-stream',
      };
      // Do not set ACL for private buckets; for public buckets bucket policy controls access.
      await s3.send(new PutObjectCommand(input));
      return { bucket: YC_BUCKET, key, url: getPublicUrl(key) };
    } catch (err) {
      const isLast = attempt === maxAttempts - 1;
      const delay = baseDelay * Math.pow(2, attempt);
      console.error(`storageService.uploadFile attempt ${attempt + 1} failed for ${key}:`, err && err.message);
      if (isLast) throw err;
      // backoff
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

function getPublicUrl(key) {
  // Public bucket URL format
  return `${YC_ENDPOINT.replace(/\/$/, '')}/${YC_BUCKET}/${encodeURIComponent(key)}`;
}

async function getFileUrl(key, opts = {}) {
  if (!USE_PRIVATE) {
    return getPublicUrl(key);
  }
  // Generate signed URL valid for opts.expiresIn (seconds)
  const expiresIn = typeof opts.expiresIn === 'number' ? opts.expiresIn : 60 * 15;
  try {
    const cmd = new GetObjectCommand({ Bucket: YC_BUCKET, Key: key });
    const signed = await getSignedUrl(s3, cmd, { expiresIn });
    return signed;
  } catch (err) {
    console.error('storageService.getFileUrl error', err && err.message);
    throw err;
  }
}

async function deleteFile(key) {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: YC_BUCKET, Key: key }));
    return true;
  } catch (err) {
    console.error('storageService.deleteFile error', err && err.message);
    throw err;
  }
}

module.exports = {
  uploadFile,
  getFileUrl,
  deleteFile,
};

