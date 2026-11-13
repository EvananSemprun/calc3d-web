import { Toaster as SonnerToaster, toast } from 'sonner';

/**
 * Toasts de marca sobre Sonner. Se usa `unstyled` + `classNames` con clases
 * Tailwind de la paleta estricta (en vez de pelear con las CSS vars internas
 * de Sonner). Montar <Toaster /> una sola vez (en AppLayout).
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      gap={10}
      toastOptions={{
        unstyled: true,
        classNames: {
          // Sin `border-l-<color>` en el base: el ancho lo da `border-l-2` y el
          // color lo hereda de la regla global `* { border-color }`. Así los
          // tipos (success/error) son la única utilidad `border-l-*` y ganan
          // sin depender del orden de escaneo de Tailwind.
          toast:
            'glass flex w-full items-start gap-3 rounded-xl border-l-2 p-4 text-sm shadow-card',
          title: 'font-medium text-foreground',
          description: 'text-muted-foreground',
          success: 'border-l-success',
          error: 'border-l-destructive',
          icon: 'shrink-0',
          closeButton:
            'rounded-md text-muted-foreground transition-colors hover:text-foreground',
        },
      }}
    />
  );
}

/** Feedback global de acciones de API. No usar para validación de formularios. */
export const notify = {
  success: (message: string, description?: string) => toast.success(message, { description }),
  // `duration` alarga el toast, y TIENE TECHO (medido a 375 px el 13/11): ~37 palabras entran en
  // 15 s con margen (el rechazo de borrar una ficha, `FichaDialog`); ~50 NO (el de borrar un
  // insumo: 12,5-15 s de lectura contra 15,2 s visibles, y en el teléfono no hay hover que lo
  // pause). Un aviso accionable de esa longitud no se alarga: va en un cartel `role="alert"`
  // que no se va solo (ver `pages/Catalog.tsx`).
  error: (message: string, description?: string, opciones?: { duration?: number }) =>
    toast.error(message, { description, duration: opciones?.duration }),
  info: (message: string, description?: string) => toast(message, { description }),
};
