import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

const TOKEN_KEY = 'calc3d_token';
const REFRESH_KEY = 'calc3d_refresh';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const getRefreshToken = () => localStorage.getItem(REFRESH_KEY);
export const setTokens = (accessToken: string, refreshToken: string) => {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
};
export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
};

/** Rutas públicas donde un 401 NO debe redirigir a /login. */
const PUBLIC_PREFIXES = ['/login', '/forgot-password', '/reset-password'];
const onPublicPage = () => PUBLIC_PREFIXES.some((p) => location.pathname.startsWith(p));

/** Cliente HTTP centralizado con el access token inyectado en cada request. */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api',
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Rotación de sesión: un solo /refresh en vuelo aunque varias requests fallen a la vez.
let refreshPromise: Promise<string> | null = null;

async function refreshAccess(): Promise<string> {
  const rt = getRefreshToken();
  if (!rt) throw new Error('sin refresh token');
  // axios "pelado" para no recursar en este mismo interceptor.
  const res = await axios.post<{ accessToken: string; refreshToken: string }>(
    `${api.defaults.baseURL}/auth/refresh`,
    { refreshToken: rt },
  );
  setTokens(res.data.accessToken, res.data.refreshToken);
  return res.data.accessToken;
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const status = error.response?.status;
    const url = original?.url ?? '';
    const isAuthCall = url.includes('/auth/login') || url.includes('/auth/refresh');

    // Access token vencido: intenta rotar UNA vez y reintenta la request original.
    if (status === 401 && original && !original._retry && !isAuthCall && getRefreshToken()) {
      original._retry = true;
      try {
        refreshPromise = refreshPromise ?? refreshAccess();
        const newAccess = await refreshPromise;
        original.headers.Authorization = `Bearer ${newAccess}`;
        return api(original);
      } catch {
        clearToken();
        if (!onPublicPage()) location.href = '/login';
        return Promise.reject(error);
      } finally {
        refreshPromise = null;
      }
    }

    // 401 sin posibilidad de refrescar: cerrar sesión (salvo en páginas públicas).
    if (status === 401 && !isAuthCall && !onPublicPage()) {
      clearToken();
      location.href = '/login';
    }
    return Promise.reject(error);
  },
);

/**
 * Descarga autenticada de un archivo (CSV/PDF/JSON). El token viaja en el header
 * de axios, no en la URL. Dispara la descarga en el navegador.
 */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const res = await api.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Extrae un mensaje de error legible (en español) de una respuesta de axios. */
export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return 'No se pudo conectar con el servidor. ¿Está corriendo el backend (pnpm dev:api)?';
    }
    if (error.response.status === 429) {
      return 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.';
    }
    const data = error.response.data as
      | { message?: string; errors?: { path: string; message: string }[] }
      | undefined;
    if (data?.errors?.length) {
      return data.errors.map((e) => e.message).join(', ');
    }
    if (typeof data?.message === 'string') return data.message;
  }
  return 'Ocurrió un error inesperado';
}
