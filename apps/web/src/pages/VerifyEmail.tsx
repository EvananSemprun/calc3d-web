import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Box, CheckCircle2, XCircle } from 'lucide-react';
import { api, apiErrorMessage, getToken } from '@/lib/api';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AuthBrandPanel, AuthShell } from '@/components/AuthShell';

type State = 'checking' | 'ok' | 'error';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<State>('checking');
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // evita doble ejecución en StrictMode
    ran.current = true;
    if (!token) {
      setState('error');
      setError('Falta el token de verificación.');
      return;
    }
    api
      .post('/auth/verify-email', { token })
      .then(() => setState('ok'))
      .catch((e) => {
        setState('error');
        setError(apiErrorMessage(e));
      });
  }, [token]);

  const loggedIn = !!getToken();

  return (
    <AuthShell brand={<AuthBrandPanel title="Verificación de correo." subtitle="Un paso para activar tu cuenta por completo." />}>
      <div className="mb-6 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-blue text-white shadow-glow-blue">
          <Box className="h-5 w-5" />
        </span>
        <span className="font-display text-lg font-bold">Calc3D</span>
        <ThemeToggle className="ml-auto" />
      </div>

      {state === 'checking' && (
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold">Verificando…</h1>
          <p className="text-sm text-muted-foreground">Un momento.</p>
        </div>
      )}
      {state === 'ok' && (
        <div className="space-y-3">
          <CheckCircle2 className="h-10 w-10 text-success" />
          <h1 className="font-display text-2xl font-bold">¡Correo verificado!</h1>
          <p className="text-sm text-muted-foreground">Tu cuenta quedó activa por completo.</p>
          <Link
            to={loggedIn ? '/' : '/login'}
            className="inline-block rounded-lg bg-brand-yellow px-4 py-2 text-sm font-semibold text-brand-yellow-foreground transition-colors hover:bg-brand-yellow-hover"
          >
            {loggedIn ? 'Ir a la app' : 'Iniciar sesión'}
          </Link>
        </div>
      )}
      {state === 'error' && (
        <div className="space-y-3">
          <XCircle className="h-10 w-10 text-destructive" />
          <h1 className="font-display text-2xl font-bold">No se pudo verificar</h1>
          <p className="text-sm text-muted-foreground">{error ?? 'El enlace no es válido o ya venció.'}</p>
          <Link to={loggedIn ? '/' : '/login'} className="inline-block text-sm font-semibold text-brand-yellow-ink hover:underline">
            {loggedIn ? 'Volver a la app' : 'Ir a iniciar sesión'}
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
