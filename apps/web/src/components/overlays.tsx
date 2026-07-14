import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';

/**
 * Modal accesible sobre Radix Dialog: foco atrapado, cierre con Esc y
 * click-fuera, scroll-lock, aria-* y retorno de foco al disparador. Drop-in
 * controlado: el padre maneja `open`/`onOpenChange`.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm data-[state=open]:animate-[overlay-in_0.22s_ease-out] data-[state=closed]:animate-[overlay-out_0.15s_ease-in]" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl glass p-5 focus:outline-none data-[state=open]:animate-[dialog-in_0.34s_cubic-bezier(0.34,1.4,0.5,1)] data-[state=closed]:animate-[dialog-out_0.16s_ease-in]',
            className,
          )}
        >
          <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
            <div>
              <DialogPrimitive.Title className="font-display text-lg font-semibold">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label="Cerrar"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          {/* Cuerpo scrolleable: el modal nunca se sale de la pantalla (-mx/px-5
              compensa el padding para que la barra de scroll quede al borde). */}
          <div className="-mx-5 flex-1 overflow-y-auto px-5 animate-[dialog-content-in_0.32s_0.05s_both_ease-out]">
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'destructive';
};
type ConfirmState = ConfirmOptions & { resolve: (value: boolean) => void };

const ConfirmContext = React.createContext<(options: ConfirmOptions) => Promise<boolean>>(
  () => Promise.resolve(false),
);

/**
 * Confirmación imperativa accesible (Radix AlertDialog). Montar
 * <ConfirmProvider> una vez (AppLayout). En consumidores:
 *   const confirm = useConfirm();
 *   if (await confirm({ title: '¿Eliminar?', tone: 'destructive' })) remove();
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<ConfirmState | null>(null);

  const confirm = React.useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setState({ ...options, resolve })),
    [],
  );

  // Resuelve la promesa pendiente y desmonta el diálogo.
  const settle = (value: boolean) =>
    setState((current) => {
      current?.resolve(value);
      return null;
    });

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialogPrimitive.Root
        open={state != null}
        onOpenChange={(next) => {
          if (!next) settle(false);
        }}
      >
        <AlertDialogPrimitive.Portal>
          <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm data-[state=open]:animate-[overlay-in_0.22s_ease-out] data-[state=closed]:animate-[overlay-out_0.15s_ease-in]" />
          <AlertDialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl glass p-5 focus:outline-none data-[state=open]:animate-[dialog-in_0.34s_cubic-bezier(0.34,1.4,0.5,1)] data-[state=closed]:animate-[dialog-out_0.16s_ease-in]">
            <AlertDialogPrimitive.Title className="font-display text-lg font-semibold">
              {state?.title}
            </AlertDialogPrimitive.Title>
            {state?.description && (
              <AlertDialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                {state.description}
              </AlertDialogPrimitive.Description>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <AlertDialogPrimitive.Cancel asChild>
                <Button variant="outline">{state?.cancelLabel ?? 'Cancelar'}</Button>
              </AlertDialogPrimitive.Cancel>
              <AlertDialogPrimitive.Action asChild>
                <Button
                  variant={state?.tone === 'destructive' ? 'destructive' : 'accent'}
                  onClick={() => settle(true)}
                >
                  {state?.confirmLabel ?? 'Confirmar'}
                </Button>
              </AlertDialogPrimitive.Action>
            </div>
          </AlertDialogPrimitive.Content>
        </AlertDialogPrimitive.Portal>
      </AlertDialogPrimitive.Root>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return React.useContext(ConfirmContext);
}

/** Provider de tooltips. Montar una vez en AppLayout. */
export const TooltipProvider = TooltipPrimitive.Provider;

/** Tooltip de marca: da nombre accesible a botones icon-only. */
export function Tooltip({
  label,
  side = 'top',
  children,
}: {
  label: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: React.ReactNode;
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 rounded-md glass px-2 py-1 text-xs text-foreground shadow-card data-[state=delayed-open]:animate-[overlay-in_0.12s_ease-out]"
        >
          {label}
          <TooltipPrimitive.Arrow className="fill-[hsl(var(--glass-border))]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
