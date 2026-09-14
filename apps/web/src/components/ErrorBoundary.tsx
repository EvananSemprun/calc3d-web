import * as React from 'react';
import { Button } from '@/components/ui';

interface State {
  error: Error | null;
  componentStack: string | null;
}

/**
 * Red de seguridad de TODA la app. Sin esto, cualquier error al dibujar un
 * componente desmonta el árbol entero y deja la pantalla vacía —solo el fondo—
 * sin decir qué pasó ni dónde. Así se vio un fallo después de iniciar sesión
 * (2026-09-13) que desaparecía al recargar y no dejaba rastro.
 *
 * Muestra el error y los primeros componentes de la pila para que se pueda
 * reportar con una captura, y lo deja completo en la consola.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] La pantalla falló al dibujarse:', error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    const donde = componentStack
      ?.split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 6)
      .join('\n');

    return (
      <div role="alert" className="grid min-h-screen place-items-center p-6">
        <div className="w-full max-w-xl space-y-4 rounded-2xl border border-destructive/40 bg-card p-6 shadow-card">
          <div className="space-y-1">
            <h1 className="font-display text-xl font-semibold">La pantalla falló al dibujarse</h1>
            <p className="text-sm text-muted-foreground">
              Recargar suele alcanzar, pero esto no debería pasar. Sacale una captura a este cuadro
              para encontrar la causa.
            </p>
          </div>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background/60 p-3 text-xs text-destructive">
            {`${error.name}: ${error.message}`}
            {donde ? `\n\nDónde:\n${donde}` : ''}
          </pre>
          <Button variant="accent" onClick={() => location.reload()}>
            Recargar
          </Button>
        </div>
      </div>
    );
  }
}
