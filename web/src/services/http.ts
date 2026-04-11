import axios from 'axios';

import { useAppStore } from '../stores/appStore';

export const http = axios.create({
  baseURL: '/api/v1',
  timeout: 15000,
});

http.interceptors.request.use((config) => {
  const skipAuth = config.headers?.['X-Skip-Auth'] === 'true';

  if (skipAuth) {
    delete config.headers['X-Skip-Auth'];
    return config;
  }

  const token = useAppStore.getState().token;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});
