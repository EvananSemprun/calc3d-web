import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Box } from 'lucide-react';
import { api, apiErrorMessage } from '@/lib/api';
import { Button, Field, Input } from '@/components/ui';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AuthBrandPanel, AuthShell } from '@/components/AuthShell';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true); // respuesta SIEMPRE genérica (no revela si el correo existe)
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      brand={<AuthBrandPanel title="Recupera tu acceso." subtitle="Te enviaremos un enlace para crear una nueva contraseña." />}
    >
      <div className="mb-6 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-blue text-white shadow-glow-blue">
          <Box className="h-5 w-5" />
        </span>
        <span className="font-display text-lg font-bold">Calc3D</span>
        <ThemeToggle className="ml-auto" />
      </div>

      {sent ? (
        <div className="space-y-3">
          <h1 className="font-display text-2xl font-bold">Revisa tu correo</h1>
          <p className="text-sm text-muted-foreground">
            Si <strong>{email}</strong> tiene una cuenta, le enviamos un enlace para restablecer la
            contraseña. El enlace vence en 1 hora.
          </p>
          <Link to="/login" className="inline-block text-sm font-semibold text-brand-yellow-ink hover:underline">
            ← Volver a iniciar sesión
          </Link>
        </div>
      ) : (
        <>
          <h1 className="font-display text-2xl font-bold">¿Olvidaste tu contraseña?</h1>
          <p className="mt-1 text-sm text-muted-foreground">Escribe tu correo y te mandamos el enlace.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Correo">
              <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            {error && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" variant="accent" className="w-full" disabled={busy || !email}>
              {busy ? 'Enviando…' : 'Enviar enlace'}
            </Button>
          </form>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            <Link to="/login" className="font-semibold text-brand-yellow-ink hover:underline">
              Volver a iniciar sesión
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
