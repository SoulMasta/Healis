// Minimal upload service that sends files to backend storage endpoint.
// The backend handles uploading to Yandex Object Storage and returns a URL.
const ALLOWED_EXTENSIONS = new Set([
  '.txt', '.md', '.rtf', '.csv', '.pdf',
  '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
  '.zip', '.rar', '.7z',
  '.png', '.jpg', '.jpeg', '.webp', '.gif',
]);
const ALLOWED_AVATAR_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function getExtension(filename) {
  if (!filename || !filename.includes('.')) return '';
  return '.' + filename.split('.').pop().toLowerCase();
}

function isAllowedExtension(filename, allowedSet = ALLOWED_EXTENSIONS) {
  const ext = getExtension(filename);
  return allowedSet.has(ext);
}

function xhrUpload(url, formData, onProgress, timeout = 0) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    if (timeout) xhr.timeout = timeout;
    xhr.withCredentials = true;
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText || '{}');
          resolve(json);
        } catch (e) {
          reject(e);
        }
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.ontimeout = () => reject(new Error('Upload timed out'));
    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const p = Math.round((e.loaded / e.total) * 100);
          onProgress(p);
        }
      };
    }
    xhr.send(formData);
  });
}

/**
 * Upload a single file to backend storage.
 * Returns { url, key, size, type, originalName }.
 * folder is used only to route to specific backend endpoints when necessary.
 */
export async function uploadFile(file, options = {}) {
  const { folder = '', onProgress, isAvatar = false } = options;
  if (!file) throw new Error('No file provided');
  const allowedSet = isAvatar ? ALLOWED_AVATAR_EXTENSIONS : ALLOWED_EXTENSIONS;
  if (!isAllowedExtension(file.name, allowedSet)) {
    const ext = getExtension(file.name);
    throw new Error(`Unsupported file type: ${ext || 'unknown'}`);
  }
  const maxSize = isAvatar ? 5 * 1024 * 1024 : 25 * 1024 * 1024;
  if (file.size > maxSize) {
    const maxMB = maxSize / (1024 * 1024);
    throw new Error(`File size exceeds ${maxMB}MB limit`);
  }

  // Decide endpoint: avatars go to /api/user/avatar (server will accept multipart or legacy body).
  // All other files use generic /api/storage/upload which only uploads to Yandex and returns URL.
  const form = new FormData();
  form.append('file', file, file.name);

  const endpoint = isAvatar ? '/api/user/avatar' : '/api/storage/upload';
  const resp = await xhrUpload(endpoint, form, onProgress);
  return {
    url: resp.url,
    path: resp.key || null,
    size: resp.size || file.size,
    type: resp.type || file.type,
    originalName: resp.originalName || file.name,
  };
}

export async function uploadFiles(files, options = {}) {
  const { folder = '', onProgress, onFileComplete } = options;
  const results = [];
  const total = files.length;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const result = await uploadFile(file, {
      folder,
      onProgress: (fileProgress) => {
        if (onProgress) {
          const overallProgress = Math.round(((i * 100) + fileProgress) / total);
          onProgress(overallProgress);
        }
      },
    });
    results.push(result);
    if (onFileComplete) onFileComplete(result, i, total);
  }
  return results;
}

export async function deleteFile(path) {
  // Deleting files requires backend endpoint. Keep legacy interface for now.
  if (!path) throw new Error('No file path provided');
  const res = await fetch('/api/storage/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ key: path }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Delete failed: ${res.status} ${text}`);
  }
  return;
}

export { ALLOWED_EXTENSIONS, ALLOWED_AVATAR_EXTENSIONS };

