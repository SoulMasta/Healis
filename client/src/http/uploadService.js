import { supabase } from './supabaseClient';

const BUCKET_NAME = 'healis-files';

// Allowed file extensions (matching backend allowlist)
const ALLOWED_EXTENSIONS = new Set([
  '.txt', '.md', '.rtf', '.csv', '.pdf',
  '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
  '.zip', '.rar', '.7z',
  '.png', '.jpg', '.jpeg', '.webp', '.gif',
]);

const ALLOWED_AVATAR_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

/**
 * Generate a unique filename with timestamp and random token.
 * Supabase Storage accepts only ASCII-safe object keys; non-ASCII (e.g. Cyrillic) causes "Invalid key".
 * @param {string} originalName - Original file name
 * @returns {string} Unique filename (ASCII-only)
 */
function generateUniqueFilename(originalName) {
  const ext = originalName.includes('.')
    ? '.' + originalName.split('.').pop().toLowerCase().replace(/[^a-z0-9]/gi, '')
    : '';
  const baseName = originalName.includes('.')
    ? originalName.slice(0, originalName.lastIndexOf('.'))
    : originalName;
  // ASCII-only: Supabase Storage rejects non-ASCII (Cyrillic, accents, etc.)
  const safeName = baseName
    .replace(/[/\\]/g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '')
    .slice(0, 80) || 'file';

  const timestamp = Date.now();
  const randomToken = Math.random().toString(36).slice(2, 10);
  return `${timestamp}-${randomToken}-${safeName}${ext}`;
}

/**
 * Get file extension from filename
 * @param {string} filename
 * @returns {string} Extension with leading dot (e.g., '.pdf')
 */
function getExtension(filename) {
  if (!filename || !filename.includes('.')) return '';
  return '.' + filename.split('.').pop().toLowerCase();
}

/**
 * Validate file extension
 * @param {string} filename
 * @param {Set<string>} allowedSet
 * @returns {boolean}
 */
function isAllowedExtension(filename, allowedSet = ALLOWED_EXTENSIONS) {
  const ext = getExtension(filename);
  return allowedSet.has(ext);
}

/**
 * Upload a file to Supabase Storage
 * @param {File} file - File to upload
 * @param {Object} options - Upload options
 * @param {string} options.folder - Folder path within bucket (e.g., 'cards/123' or 'avatars/456')
 * @param {function} options.onProgress - Progress callback (0-100)
 * @param {boolean} options.isAvatar - Whether this is an avatar upload (stricter image validation)
 * @returns {Promise<{url: string, path: string, size: number, type: string}>}
 */
export async function uploadFile(file, options = {}) {
  const { folder = '', onProgress, isAvatar = false } = options;

  if (!supabase) {
    throw new Error('Supabase is not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY in your hosting (Vercel/Railway) Environment Variables.');
  }
  if (!file) {
    throw new Error('No file provided');
  }

  // Validate file extension
  const allowedSet = isAvatar ? ALLOWED_AVATAR_EXTENSIONS : ALLOWED_EXTENSIONS;
  if (!isAllowedExtension(file.name, allowedSet)) {
    const ext = getExtension(file.name);
    throw new Error(`Unsupported file type: ${ext || 'unknown'}`);
  }

  // Size limits
  const maxSize = isAvatar ? 5 * 1024 * 1024 : 25 * 1024 * 1024; // 5MB for avatars, 25MB for others
  if (file.size > maxSize) {
    const maxMB = maxSize / (1024 * 1024);
    throw new Error(`File size exceeds ${maxMB}MB limit`);
  }

  // Generate unique filename
  const uniqueFilename = generateUniqueFilename(file.name);
  let filePath = folder ? `${folder}/${uniqueFilename}` : uniqueFilename;
  // Defensive: ensure path is ASCII-only (Supabase rejects non-ASCII keys; also fixes old cached bundles)
  const pathParts = filePath.split('/');
  const lastSegment = pathParts.pop();
  const safeLast = (lastSegment && lastSegment.replace(/[^a-zA-Z0-9_.-]/g, '')) || 'file';
  const ext = /\.([a-z0-9]+)$/i.exec(safeLast);
  const fallbackExt = getExtension(file.name).replace(/[^a-zA-Z0-9.]/g, '');
  pathParts.push(ext ? safeLast : `${safeLast}${fallbackExt.length > 1 ? fallbackExt : '.bin'}`);
  filePath = pathParts.join('/');

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/45c433a3-fa5c-4697-b19e-a367061682dc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'uploadService.js:uploadFile',message:'upload path',data:{originalName:file.name,filePath,folder},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
  // #endregion

  // Upload to Supabase with progress tracking
  // Note: Supabase JS v2 doesn't have built-in upload progress for small files.
  // For larger files, we can use XMLHttpRequest for progress, but for simplicity
  // we'll use the standard upload and simulate progress.
  
  if (onProgress) {
    onProgress(10); // Started
  }

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/45c433a3-fa5c-4697-b19e-a367061682dc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'uploadService.js:uploadError',message:'Supabase upload error',data:{message:error.message,filePath},timestamp:Date.now(),hypothesisId:'H1,H3'})}).catch(()=>{});
    // #endregion
    console.error('Supabase upload error:', error);
    throw new Error(error.message || 'Upload failed');
  }

  if (onProgress) {
    onProgress(90); // Upload complete, getting URL
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(data.path);

  if (!urlData?.publicUrl) {
    throw new Error('Failed to get public URL');
  }

  if (onProgress) {
    onProgress(100); // Done
  }

  return {
    url: urlData.publicUrl,
    path: data.path,
    size: file.size,
    type: file.type,
    originalName: file.name,
  };
}

/**
 * Upload multiple files with progress tracking
 * @param {File[]} files - Array of files to upload
 * @param {Object} options - Upload options
 * @param {string} options.folder - Folder path within bucket
 * @param {function} options.onProgress - Progress callback (0-100, combined for all files)
 * @param {function} options.onFileComplete - Called when each file completes
 * @returns {Promise<Array<{url: string, path: string, size: number, type: string}>>}
 */
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
    
    if (onFileComplete) {
      onFileComplete(result, i, total);
    }
  }

  return results;
}

/**
 * Delete a file from Supabase Storage
 * @param {string} path - File path within bucket
 * @returns {Promise<void>}
 */
export async function deleteFile(path) {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY in your hosting (Vercel/Railway) Environment Variables.');
  }
  if (!path) {
    throw new Error('No file path provided');
  }

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([path]);

  if (error) {
    console.error('Supabase delete error:', error);
    throw new Error(error.message || 'Delete failed');
  }
}

export { ALLOWED_EXTENSIONS, ALLOWED_AVATAR_EXTENSIONS };
