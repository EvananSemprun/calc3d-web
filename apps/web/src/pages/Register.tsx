import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Box } from 'lucide-react';
import { RegisterSchema, type RegisterDto } from '@calc3d/shared';
import { useAuth } from '@/auth/AuthContext';
import { apiErrorMessage } from '@/lib/api';
import { Button, Field, Input } from '@/components/ui';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AuthBrandPanel, AuthShell } from '@/components/AuthShell';

export function RegisterPage() {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterDto>({ resolver: zodResolver(RegisterSchema) });

  const onSubmit = async (data: RegisterDto) => {
    setServerError(null);
    try {
      await registerUser(data);
      navigate('/');
    } catch (e) {
      setServerError(apiErrorMessage(e));
    }
  };

  return (
    <AuthShell
      brand={
        <AuthBrandPanel
          title="Tu taller, rentable."
          subtitle="Crea tu negocio en Calc3D y deja de cotizar a ojo. Catálogos reutilizables, márgenes claros y precios de mayoreo, todo en un solo lugar."
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
      <h1 className="font-display text-2xl font-bold">Crear tu negocio</h1>
      <p className="mt-1 text-sm text-muted-foreground">Empieza a cotizar con precisión.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
        <Field label="Nombre del negocio" error={errors.organizationName?.message}>
          <Input {...register('organizationName')} />
        </Field>
        <Field label="Tu nombre" error={errors.name?.message}>
          <Input {...register('name')} />
        </Field>
        <Field label="Correo" error={errors.email?.message}>
          <Input type="email" autoComplete="email" {...register('email')} />
        </Field>
        <Field label="Contraseña" error={errors.password?.message} hint="Mínimo 8 caracteres">
          <Input type="password" autoComplete="new-password" {...register('password')} />
        </Field>
        {serverError && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {serverError}
          </p>
        )}
        <Button type="submit" variant="accent" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Creando…' : 'Crear cuenta'}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{' '}
        <Link to="/login" className="font-semibold text-brand-yellow-ink hover:underline">
          Inicia sesión
        </Link>
      </p>
    </AuthShell>
  );
}
