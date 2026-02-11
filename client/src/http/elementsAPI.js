import axios from 'axios';
import { uploadFile } from './uploadService';

const API_BASE = '/workspace';

function normalizeElement(el) {
  if (!el || typeof el !== 'object') return el;
  // Normalize ids for frontend convenience
  const out = { ...el };
  if (out.id == null && out.elementId != null) out.id = out.elementId;
  return out;
}

function normalizeElementList(list) {
  if (!Array.isArray(list)) return list;
  return list.map(normalizeElement);
}

export async function getElementsByDesk(deskId) {
  const res = await axios.get(`${API_BASE}/desk/${deskId}/elements`);
  return normalizeElementList(res.data);
}

export async function createElementOnDesk(deskId, data) {
  const res = await axios.post(`${API_BASE}/desk/${deskId}/elements`, data);
  return normalizeElement(res.data);
}

export async function updateElement(elementId, data) {
  const res = await axios.put(`${API_BASE}/elements/${elementId}`, data);
  return normalizeElement(res.data);
}

export async function deleteElement(elementId) {
  const res = await axios.delete(`${API_BASE}/elements/${elementId}`);
  return res.data;
}

/**
 * Upload a file to Supabase and save the URL to the backend
 * @param {string} deskId - Desk ID
 * @param {File} file - File to upload
 * @param {Object} options - Upload options
 * @param {function} options.onProgress - Progress callback (0-100)
 * @returns {Promise<{url: string, title: string, originalName: string, mimeType: string, size: number}>}
 */
export async function uploadFileToDesk(deskId, file, options = {}) {
  const { onProgress } = options;

  // Upload to Supabase Storage
  const uploaded = await uploadFile(file, {
    folder: `desks/${deskId}`,
    onProgress,
  });

  // Save the URL to the backend
  const res = await axios.post(`${API_BASE}/desk/${deskId}/upload`, {
    url: uploaded.url,
    originalName: uploaded.originalName,
    mimeType: uploaded.type,
    size: uploaded.size,
  });

  return res.data;
}

export async function getLinkPreview(url) {
  const res = await axios.post(`${API_BASE}/link/preview`, { url });
  return res.data;
}


