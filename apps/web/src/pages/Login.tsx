import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Box } from 'lucide-react';
import { LoginSchema, type LoginDto } from '@calc3d/shared';
import { useAuth } from '@/auth/AuthContext';
import { api, apiErrorMessage } from '@/lib/api';
import { Button, Field, Input } from '@/components/ui';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AuthBrandPanel, AuthShell } from '@/components/AuthShell';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginDto>({ resolver: zodResolver(LoginSchema) });

  // La API está en el plan free de Render, que la apaga tras 15 min sin uso y
  // tarda en arrancar. Se la despierta apenas se abre el login: mientras se
  // escriben correo y contraseña, ya va arrancando. /health no toca la base.
  useEffect(() => {
    fetch(`${api.defaults.baseURL}/health`).catch(() => {
      // Si falla, el login mismo mostrará el error real.
    });
  }, []);

  // Si el login tarda, se explica por qué en vez de dejar un "Entrando…" mudo.
  const [despertando, setDespertando] = useState(false);
  useEffect(() => {
    if (!isSubmitting) {
      setDespertando(false);
      return;
    }
    const t = setTimeout(() => setDespertando(true), 6000);
    return () => clearTimeout(t);
  }, [isSubmitting]);

  const onSubmit = async (data: LoginDto) => {
    setServerError(null);
    try {
      await login(data);
      navigate('/');
    } catch (e) {
      setServerError(apiErrorMessage(e));
    }
  };

  return (
    <AuthShell
      brand={
        <AuthBrandPanel
          title="Cotiza con precisión."
          subtitle="Calcula el costo real y el precio justo de cada impresión 3D — material, desgaste, luz, mano de obra y mayoreo, en segundos."
        />
      }
    >
      <div className="mb-6 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-blue text-white shadow-glow-blue">
          <Box className="h-5 w-5" />
        </span>
        <span className="font-display text-lg font-bold">Calc3D</span>
        <ThemeToggle className="ml-auto" />
      </div>
      <h1 className="font-display text-2xl font-bold">Iniciar sesión</h1>
      <p className="mt-1 text-sm text-muted-foreground">Entra para seguir cotizando.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
        <Field label="Correo" error={errors.email?.message}>
          <Input type="email" autoComplete="email" {...register('email')} />
        </Field>
        <Field label="Contraseña" error={errors.password?.message}>
          <Input type="password" autoComplete="current-password" {...register('password')} />
        </Field>
        {serverError && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {serverError}
          </p>
        )}
        <Button type="submit" variant="accent" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Entrando…' : 'Entrar'}
        </Button>
        {despertando && (
          <p role="status" className="text-center text-xs text-muted-foreground">
            El servidor se está despertando (se apaga solo cuando nadie lo usa). Puede tardar
            uno o dos minutos la primera vez; no cierres la página.
          </p>
        )}
      </form>
      <p className="mt-3 text-center text-sm">
        <Link to="/forgot-password" className="text-muted-foreground hover:text-foreground hover:underline">
          ¿Olvidaste tu contraseña?
        </Link>
      </p>
    </AuthShell>
  );
}
