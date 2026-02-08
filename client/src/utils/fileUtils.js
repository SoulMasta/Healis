import axios from 'axios';

export function readImageSizeFromFile(file) {
  return new Promise((resolve, reject) => {
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
        resolve({
          width: Number(img.naturalWidth || img.width || 0),
          height: Number(img.naturalHeight || img.height || 0),
        });
      };
      img.onerror = () => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
        reject(new Error('Failed to read image'));
      };
      img.src = url;
    } catch (e) {
      reject(e);
    }
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'file';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function fetchFileBlob(url) {
  const res = await axios.get(url, { responseType: 'blob', timeout: 20_000 });
  return res.data;
}
