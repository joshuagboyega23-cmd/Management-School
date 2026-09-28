import axios from 'axios';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
});

export const SERVER_WAKING_MESSAGE = 'The server is waking up. Please wait a few seconds…';

export const postAuthRequest = async (url, data, onNetworkFailure) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await API.post(url, data, { timeout: 60000 });
    } catch (error) {
      if (error.response || attempt === 2) throw error;
      onNetworkFailure?.();
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
};

export const getAuthErrorMessage = (error, fallback) => {
  if (!error.response) return SERVER_WAKING_MESSAGE;
  return error.response.data?.message || error.response.data?.error || fallback;
};

export const wakeServer = () => {
  void API.get('/health', { timeout: 10000 }).catch(() => {});
};

// Interceptor to attach JWT token to every request automatically
API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle token expiration/unauthorized responses
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      if (error.response.data?.message?.includes('token') || error.response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    return Promise.reject(error);
  }
);

export default API;