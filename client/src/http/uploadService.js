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
 * Compress image for faster mobile uploads. Returns original file if not an image or compression fails.
 */
export function compressImageForUpload(file, opts = {}) {
  const { maxWidth = 1600, quality = 0.85 } = opts;
  if (!file?.type?.startsWith('image/')) return Promise.resolve(file);
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w <= maxWidth && file.size <= 1024 * 1024) {
        resolve(file);
        return;
      }
      if (w > maxWidth) {
        h = Math.round((h * maxWidth) / w);
        w = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size < file.size) {
            resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
          } else {
            resolve(file);
          }
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

/**
 * Upload a single file to backend storage.
 * Returns { url, key, size, type, originalName }.
 * folder is sent as multipart field (server may use it to choose placement).
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

  const form = new FormData();
  form.append('file', file, file.name);
  if (folder) form.append('folder', folder);
  // Always upload via generic storage endpoint; backend will return { url, key, ... }.
  const endpoint = '/api/storage/upload';
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
      isAvatar: options.isAvatar,
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

