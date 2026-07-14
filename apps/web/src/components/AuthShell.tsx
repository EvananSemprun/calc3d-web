import { type ReactNode } from 'react';
import { Box } from 'lucide-react';
import { GoldText, GridPattern, Reveal } from '@/components/effects';
import { AnimatedBackground } from '@/components/AnimatedBackground';

/** Estructura split de las pantallas de autenticación: panel de marca + form glass. */
export function AuthShell({ brand, children }: { brand: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <AnimatedBackground />
      {brand}
      <div className="flex items-center justify-center px-4 py-10">
        <Reveal className="w-full max-w-sm rounded-2xl glass p-6 sm:p-8">{children}</Reveal>
      </div>
    </div>
  );
}

/** Panel lateral de marca (oculto en móvil) con cuadrícula blueprint y resplandor. */
export function AuthBrandPanel({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="surface-grid relative hidden overflow-hidden bg-brand-blue/10 lg:block">
      <GridPattern className="text-brand-blue/30" />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-brand-blue/30 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 bottom-10 h-64 w-64 rounded-full bg-brand-yellow/10 blur-3xl"
      />
      <div className="relative flex h-full flex-col justify-between p-10 xl:p-14">
        <div className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-blue text-white shadow-glow-blue ring-1 ring-inset ring-white/10">
            <Box className="h-6 w-6" />
          </span>
          <span className="font-display text-xl font-bold">Calc3D</span>
        </div>
        <div className="max-w-md">
          <h2 className="font-display text-4xl font-bold leading-tight xl:text-5xl">
            <GoldText>{title}</GoldText>
          </h2>
          <p className="mt-4 text-base text-muted-foreground">{subtitle}</p>
        </div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Panel de precisión · Impresión 3D
        </p>
      </div>
    </div>
  );
}
