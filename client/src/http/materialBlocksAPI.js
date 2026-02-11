import axios from 'axios';
import { uploadFile } from './uploadService';

const API_BASE = '/workspace';

export async function getMaterialBlocksByDesk(deskId) {
  const res = await axios.get(`${API_BASE}/desk/${deskId}/material-blocks`);
  return res.data;
}

export async function createMaterialBlock(deskId, data) {
  const res = await axios.post(`${API_BASE}/desk/${deskId}/material-blocks`, data);
  return res.data;
}

export async function getMaterialBlock(blockId) {
  const res = await axios.get(`${API_BASE}/material-blocks/${blockId}`);
  return res.data;
}

export async function updateMaterialBlock(blockId, data) {
  const res = await axios.put(`${API_BASE}/material-blocks/${blockId}`, data);
  return res.data;
}

export async function deleteMaterialBlock(blockId) {
  const res = await axios.delete(`${API_BASE}/material-blocks/${blockId}`);
  return res.data;
}

export async function getMaterialCards(blockId, params = {}) {
  const searchParams = new URLSearchParams();
  if (params.page != null) searchParams.set('page', params.page);
  if (params.limit != null) searchParams.set('limit', params.limit);
  if (params.search != null && params.search !== '') searchParams.set('search', params.search);
  if (params.sort != null) searchParams.set('sort', params.sort);
  const q = searchParams.toString();
  const url = `${API_BASE}/material-blocks/${blockId}/cards${q ? `?${q}` : ''}`;
  const res = await axios.get(url);
  return res.data;
}

export async function createMaterialCard(blockId, data = {}) {
  const res = await axios.post(`${API_BASE}/material-blocks/${blockId}/cards`, data);
  return res.data;
}

export async function getMaterialCard(cardId) {
  const res = await axios.get(`${API_BASE}/material-cards/${cardId}`);
  return res.data;
}

export async function updateMaterialCard(cardId, data) {
  const res = await axios.put(`${API_BASE}/material-cards/${cardId}`, data);
  return res.data;
}

export async function deleteMaterialCard(cardId) {
  const res = await axios.delete(`${API_BASE}/material-cards/${cardId}`);
  return res.data;
}

/**
 * Upload a file to Supabase and save the URL to a material card
 * @param {string} cardId - Material card ID
 * @param {File} file - File to upload
 * @param {Object} options - Upload options
 * @param {function} options.onProgress - Progress callback (0-100)
 * @returns {Promise<{id: number, file_url: string, file_type: string, size: number}>}
 */
export async function uploadMaterialCardFile(cardId, file, options = {}) {
  const { onProgress } = options;

  // Upload to Supabase Storage
  const uploaded = await uploadFile(file, {
    folder: `cards/${cardId}`,
    onProgress,
  });

  // Save the URL to the backend
  const res = await axios.post(`${API_BASE}/material-cards/${cardId}/upload`, {
    url: uploaded.url,
    fileType: uploaded.type,
    size: uploaded.size,
  });

  return res.data;
}

export async function addMaterialCardLink(cardId, { url, title }) {
  const res = await axios.post(`${API_BASE}/material-cards/${cardId}/links`, { url, title });
  return res.data;
}

export async function deleteMaterialCardLink(linkId) {
  const res = await axios.delete(`${API_BASE}/material-links/${linkId}`);
  return res.data;
}

export async function deleteMaterialCardFile(fileId) {
  const res = await axios.delete(`${API_BASE}/material-files/${fileId}`);
  return res.data;
}

export async function setMaterialCardTags(cardId, tags) {
  const res = await axios.put(`${API_BASE}/material-cards/${cardId}/tags`, { tags });
  return res.data;
}
