import axios from "axios";

function resolveBaseURL() {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  if (import.meta.env.DEV) {
    return "/api";
  }
  return "http://127.0.0.1:5000/api";
}

const api = axios.create({
  baseURL: resolveBaseURL(),
});

export default api;
