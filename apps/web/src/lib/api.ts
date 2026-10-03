import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import {
  borrarTokens,
  guardarTokens,
  leerRecordarme,
  leerTokensDelNavegador,
} from '@/lib/auth-storage';
import { esperaDeReintento, mensajeDeRed, sePuedeReintentar } from '@/lib/network-errors';

/**
 * Los tokens viven en `localStorage` o en `sessionStorage` según el checkbox
 * «Recuérdame» del login (ver `lib/auth-storage.ts`). Estos cuatro helpers
 * consultan LOS DOS almacenes: si solo miraran el que dice la preferencia, un
 * token viejo quedaría leyéndose desde el otro y la sesión no moriría nunca.
 */
export const getToken = () => leerTokensDelNavegador().accessToken;
export const getRefreshToken = () => leerTokensDelNavegador().refreshToken;
export const setTokens = (accessToken: string, refreshToken: string) =>
  guardarTokens(accessToken, refreshToken, leerRecordarme());
/** Limpia los dos almacenes SIEMPRE, sin mirar la preferencia. */
export const clearTokens = () => borrarTokens();

/** Rutas públicas donde un 401 NO debe redirigir a /login. */
const PUBLIC_PREFIXES = ['/login', '/forgot-password', '/reset-password'];
const onPublicPage = () => PUBLIC_PREFIXES.some((p) => location.pathname.startsWith(p));

/** Cliente HTTP centralizado con el access token inyectado en cada request. */
export const api = axios.create({
  // El puerto de la API es el 3001. Este valor por defecto decía 3000 y hacía
  // que, sin VITE_API_URL, el login fallara con "no se pudo conectar con el
  // servidor" aunque el backend estuviera perfecto.
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api',
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

const esperar = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Config de axios con los extras que este interceptor le cuelga. */
type ConfigConExtras = InternalAxiosRequestConfig & {
  _retry?: boolean;
  /** Cuántos reintentos de RED se hicieron ya de esta misma petición. */
  _reintentosDeRed?: number;
};

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as ConfigConExtras | undefined;
    const status = error.response?.status;
    const url = original?.url ?? '';
    const isAuthCall = url.includes('/auth/login') || url.includes('/auth/refresh');

    // Fallo de RED (sin respuesta del servidor): se reintenta con espera
    // creciente antes de molestar al usuario. La API vive en el plan free de
    // Render, que la apaga a los 15 min, y la primera petición puede tardar.
    // ⚠️ Solo LECTURAS: reintentar una escritura duplicaría datos.
    if (original) {
      const reintentosHechos = original._reintentosDeRed ?? 0;
      if (
        sePuedeReintentar({
          metodo: original.method,
          huboRespuesta: Boolean(error.response),
          codigo: error.code,
          reintentosHechos,
        })
      ) {
        original._reintentosDeRed = reintentosHechos + 1;
        await esperar(esperaDeReintento(reintentosHechos));
        return api(original);
      }
    }

    // Access token vencido: intenta rotar UNA vez y reintenta la request original.
    if (status === 401 && original && !original._retry && !isAuthCall && getRefreshToken()) {
      original._retry = true;
      try {
        refreshPromise = refreshPromise ?? refreshAccess();
        const newAccess = await refreshPromise;
        original.headers.Authorization = `Bearer ${newAccess}`;
        return api(original);
      } catch {
        clearTokens();
        if (!onPublicPage()) location.href = '/login';
        return Promise.reject(error);
      } finally {
        refreshPromise = null;
      }
    }

    // 401 sin posibilidad de refrescar: cerrar sesión (salvo en páginas públicas).
    if (status === 401 && !isAuthCall && !onPublicPage()) {
      clearTokens();
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
      // El texto depende de la causa (sin conexión / tardó demasiado / el
      // servidor no contesta) y de si estamos en desarrollo. La lógica es pura
      // y vive en `lib/network-errors.ts`.
      return mensajeDeRed({
        enDesarrollo: import.meta.env.DEV,
        enLinea: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
        codigo: error.code,
      });
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
