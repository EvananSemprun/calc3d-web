import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, X, Rocket } from 'lucide-react';
import { api } from '@/lib/api';
import { usePersistentState } from '@/lib/usePersistentState';
import { Card, CardContent } from '@/components/ui';

/** Cuenta perezosa de una lista (solo el largo importa para el checklist). */
function useCount(key: string, path: string) {
  const q = useQuery<unknown[]>({
    queryKey: [key],
    queryFn: async () => (await api.get(path)).data,
  });
  return q.data?.length ?? 0;
}

interface Step {
  done: boolean;
  label: string;
  hint: string;
  to: string;
}

/**
 * Checklist de primeros pasos, DERIVADO de datos reales (no de un flag manual):
 * cada paso se marca solo cuando existe el dato. Se puede ocultar (localStorage) y
 * desaparece solo cuando está todo completo.
 */
export function OnboardingChecklist() {
  const [hidden, setHidden] = usePersistentState('onboarding-hidden', false);
  const materials = useCount('materials', '/materials');
  const printers = useCount('printers', '/printers');
  const quotes = useCount('quotes', '/quotes');
  const orders = useCount('orders', '/orders');
  const sales = useCount('sales', '/sales');

  const steps: Step[] = [
    { done: materials > 0, label: 'Agrega tu primer material', hint: 'Filamento con su precio por kilo.', to: '/catalogs/materials' },
    { done: printers > 0, label: 'Agrega una impresora', hint: 'Para calcular desgaste y electricidad.', to: '/catalogs/printers' },
    { done: quotes > 0, label: 'Crea tu primer presupuesto', hint: 'Desde la calculadora, con tus datos del trabajo.', to: '/' },
    { done: orders > 0 || sales > 0, label: 'Registra una venta o pedido', hint: 'Empieza a medir ingresos y ganancia.', to: '/orders' },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  // Todo listo, o el usuario lo ocultó → no estorbar.
  if (hidden || doneCount === steps.length) return null;

  return (
    <Card className="border-brand-blue/30 bg-brand-blue/[0.06]">
      <CardContent className="p-4">
        <div className="mb-3 flex items-start gap-3">
          <Rocket className="mt-0.5 h-5 w-5 shrink-0 text-brand-yellow-ink" />
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display font-bold">Primeros pasos</h3>
              <button
                onClick={() => setHidden(true)}
                aria-label="Ocultar primeros pasos"
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              {doneCount} de {steps.length} listos. Completa tu taller para sacarle todo el provecho.
            </p>
          </div>
        </div>

        <ul className="space-y-1">
          {steps.map((s) => (
            <li key={s.label}>
              {s.done ? (
                <div className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                  <span className="text-muted-foreground line-through">{s.label}</span>
                </div>
              ) : (
                <Link
                  to={s.to}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent/60"
                >
                  <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1">
                    <span className="font-medium">{s.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{s.hint}</span>
                  </span>
                </Link>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
