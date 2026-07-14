import * as React from 'react';
import { api, clearToken, getToken, getRefreshToken, setTokens } from '@/lib/api';
import type { AuthTokensResponse, LoginDto, RegisterDto } from '@calc3d/shared';

interface AuthUser {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  role: 'OWNER' | 'COLLABORATOR';
  emailVerified: boolean;
  isSuperadmin: boolean;
}

interface MeResponse {
  userId: string;
  email: string;
  name: string;
  organizationId: string;
  role: 'OWNER' | 'COLLABORATOR';
  emailVerified: boolean;
  isSuperadmin: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (dto: LoginDto) => Promise<void>;
  register: (dto: RegisterDto) => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [loading, setLoading] = React.useState(true);

  const fetchMe = React.useCallback(async () => {
    const res = await api.get<MeResponse>('/auth/me');
    setUser({
      id: res.data.userId,
      email: res.data.email,
      name: res.data.name,
      organizationId: res.data.organizationId,
      role: res.data.role,
      emailVerified: res.data.emailVerified,
      isSuperadmin: res.data.isSuperadmin,
    });
  }, []);

  React.useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    fetchMe()
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, [fetchMe]);

  const handleAuth = async (path: 'login' | 'register', dto: LoginDto | RegisterDto) => {
    const res = await api.post<AuthTokensResponse>(`/auth/${path}`, dto);
    setTokens(res.data.accessToken, res.data.refreshToken);
    // La respuesta de tokens no trae `name`; /auth/me arma el usuario completo.
    await fetchMe();
  };

  const value: AuthContextValue = {
    user,
    loading,
    login: (dto) => handleAuth('login', dto),
    register: (dto) => handleAuth('register', dto),
    refresh: fetchMe,
    logout: () => {
      // Revoca el refresh token en el servidor (best-effort) antes de limpiar.
      const rt = getRefreshToken();
      if (rt) api.post('/auth/logout', { refreshToken: rt }).catch(() => undefined);
      clearToken();
      setUser(null);
      location.href = '/login';
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
