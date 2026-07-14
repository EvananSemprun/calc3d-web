import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Box } from 'lucide-react';
import { api, apiErrorMessage } from '@/lib/api';
import { Button, Field, Input } from '@/components/ui';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AuthBrandPanel, AuthShell } from '@/components/AuthShell';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => navigate('/login'), 1800);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell brand={<AuthBrandPanel title="Nueva contraseña." subtitle="Elige una contraseña segura para tu cuenta." />}>
      <div className="mb-6 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-blue text-white shadow-glow-blue">
          <Box className="h-5 w-5" />
        </span>
        <span className="font-display text-lg font-bold">Calc3D</span>
        <ThemeToggle className="ml-auto" />
      </div>

      {!token ? (
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold">Enlace inválido</h1>
          <p className="text-sm text-muted-foreground">Falta el token. Pide un enlace nuevo.</p>
          <Link to="/forgot-password" className="inline-block text-sm font-semibold text-brand-yellow-ink hover:underline">
            Solicitar enlace
          </Link>
        </div>
      ) : done ? (
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold text-success">¡Listo!</h1>
          <p className="text-sm text-muted-foreground">
            Tu contraseña fue cambiada y se cerraron las demás sesiones. Redirigiendo a inicio…
          </p>
        </div>
      ) : (
        <>
          <h1 className="font-display text-2xl font-bold">Crea una nueva contraseña</h1>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Nueva contraseña">
              <Input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            {error && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" variant="accent" className="w-full" disabled={busy || password.length < 8}>
              {busy ? 'Guardando…' : 'Cambiar contraseña'}
            </Button>
            <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
          </form>
        </>
      )}
    </AuthShell>
  );
}
