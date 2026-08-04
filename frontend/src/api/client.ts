import axios from "axios";
import { getStoredItem, removeStoredItem, setStoredItem } from "../utils/storage";

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

export function getAccessToken() {
  return getStoredItem("access_token");
}

export function getRefreshToken() {
  return getStoredItem("refresh_token");
}

export function setTokens(access: string, refresh: string) {
  setStoredItem("access_token", access);
  setStoredItem("refresh_token", refresh);
}

export function clearTokens() {
  removeStoredItem("access_token");
  removeStoredItem("refresh_token");
}

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let pendingQueue: Array<() => void> = [];

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      clearTokens();
      window.location.href = "/login";
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (isRefreshing) {
      return new Promise((resolve) => {
        pendingQueue.push(() => resolve(apiClient(originalRequest)));
      });
    }

    isRefreshing = true;
    try {
      const { data } = await axios.post(
        `${import.meta.env.VITE_API_URL}/auth/refresh/`,
        { refresh: refreshToken }
      );
      setTokens(data.access, refreshToken);
      pendingQueue.forEach((cb) => cb());
      pendingQueue = [];
      return apiClient(originalRequest);
    } catch (refreshError) {
      clearTokens();
      window.location.href = "/login";
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default apiClient;
