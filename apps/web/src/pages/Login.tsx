import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Box, Eye, EyeOff } from 'lucide-react';
import { LoginSchema, type LoginDto } from '@calc3d/shared';
import { useAuth } from '@/auth/AuthContext';
import { api, apiErrorMessage } from '@/lib/api';
import {
  guardarRecordarme,
  guardarUltimoCorreo,
  leerRecordarme,
  leerUltimoCorreo,
} from '@/lib/auth-storage';
import { Button, Checkbox, Field, Input } from '@/components/ui';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AuthBrandPanel, AuthShell } from '@/components/AuthShell';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  // El correo del último login con éxito se precarga; la contraseña NUNCA se
  // guarda (de eso se encarga el gestor del navegador). Se lee una sola vez,
  // al montar, para no pisar lo que la persona esté escribiendo.
  const [correoRecordado] = useState<string>(() => leerUltimoCorreo() ?? '');
  const [recordarme, setRecordarme] = useState<boolean>(() => leerRecordarme());

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginDto>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: correoRecordado, password: '' },
  });

  // ── Ojo para ver la contraseña ──
  const [verPassword, setVerPassword] = useState(false);
  const { ref: refPasswordRHF, ...camposPassword } = register('password');
  const inputPassword = useRef<HTMLInputElement | null>(null);
  const seleccion = useRef<[number, number] | null>(null);

  const alternarPassword = () => {
    const campo = inputPassword.current;
    seleccion.current =
      campo && campo.selectionStart !== null && campo.selectionEnd !== null
        ? [campo.selectionStart, campo.selectionEnd]
        : null;
    setVerPassword((v) => !v);
  };

  // Cambiar el `type` del input manda el cursor al final: se devuelve al punto
  // donde estaba. Solo si el foco SIGUE en el campo: si se alternó con el
  // teclado, el foco es del botón y robárselo rompería la navegación.
  useEffect(() => {
    const campo = inputPassword.current;
    const rango = seleccion.current;
    seleccion.current = null;
    if (!campo || !rango || document.activeElement !== campo) return;
    const restaurar = () => {
      try {
        campo.setSelectionRange(rango[0], rango[1]);
      } catch {
        // Algún navegador puede negar la selección; no es motivo para fallar.
      }
    };
    // Dos veces: el navegador manda el cursor al final DESPUÉS de repintar el
    // input con el `type` nuevo, así que hacerlo solo en el efecto se pierde.
    restaurar();
    const cuadro = requestAnimationFrame(restaurar);
    return () => cancelAnimationFrame(cuadro);
  }, [verPassword]);

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

  const cambiarRecordarme = (valor: boolean) => {
    setRecordarme(valor);
    // Se guarda al tocarla, no solo al entrar: la preferencia tiene que
    // sobrevivir aunque el login falle o se abandone la página.
    guardarRecordarme(valor);
  };

  const onSubmit = async (data: LoginDto) => {
    setServerError(null);
    // ⚠️ ANTES de pedir los tokens: `setTokens` lee esta preferencia para
    // decidir en qué almacén los escribe.
    guardarRecordarme(recordarme);
    try {
      await login(data);
      guardarUltimoCorreo(data.email);
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
          <div className="relative">
            <Input
              type={verPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className="pr-11"
              {...camposPassword}
              ref={(el) => {
                refPasswordRHF(el);
                inputPassword.current = el;
              }}
            />
            <button
              // `type="button"` es obligatorio: dentro de un <form>, un botón
              // sin tipo es `submit` y Enter en el campo lo dispararía en vez
              // de enviar el formulario.
              type="button"
              onClick={alternarPassword}
              // Con el mousedown cancelado el foco nunca sale del input, así
              // que el cursor se queda donde estaba al hacer click.
              onMouseDown={(e) => e.preventDefault()}
              aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              aria-pressed={verPassword}
              title={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              {verPassword ? (
                <EyeOff aria-hidden className="h-4 w-4" />
              ) : (
                <Eye aria-hidden className="h-4 w-4" />
              )}
            </button>
          </div>
        </Field>
        <div>
          <Checkbox checked={recordarme} onChange={cambiarRecordarme} label="Recuérdame" />
          <p className="mt-1.5 text-xs text-muted-foreground">
            {recordarme
              ? 'La sesión queda abierta en este dispositivo aunque cierres el navegador.'
              : 'La sesión se cierra al cerrar el navegador.'}
          </p>
        </div>
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
