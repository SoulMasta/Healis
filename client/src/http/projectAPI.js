import axios from 'axios';

const API_BASE = '/api/projects';

export async function getMyProjects() {
  const res = await axios.get(API_BASE);
  return res.data;
}

export async function createProject({ name }) {
  const res = await axios.post(API_BASE, { name });
  return res.data;
}


