import axios from 'axios';
import { getApiBaseUrl } from '../config/runtime';

// Ensure cookies (refresh token) are sent/received cross-site when allowed by CORS.
axios.defaults.withCredentials = true;

const apiBase = getApiBaseUrl();
if (apiBase) {
  axios.defaults.baseURL = apiBase;
}

