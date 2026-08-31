import { ChevronLeft, ChevronRight, PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Botones para mover un elemento dentro de una lista ordenada (la vitrina, las
 * fotos de una ficha).
 *
 * Se eligieron botones y NO arrastrar y soltar: el arrastre nativo de HTML5 no
 * funciona en pantallas táctiles, y traer una librería de DnD sería una
 * dependencia nueva para algo secundario. Esto anda en el teléfono, se maneja con
 * el teclado y no pesa nada.
 */
export function ReorderControls({
  index,
  total,
  onMove,
  firstLabel = 'Poner primero',
  itemLabel,
  className,
}: {
  index: number;
  total: number;
  /** Recibe la posición DESTINO dentro de la lista completa. */
  onMove: (to: number) => void;
  firstLabel?: string;
  /** Cómo se llama el elemento, para las etiquetas accesibles ("Llavero"). */
  itemLabel: string;
  className?: string;
}) {
  if (total < 2) return null;

  const boton =
    'grid h-7 w-7 place-items-center rounded-md border border-border bg-background/90 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground';

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {index > 0 && (
        <button
          type="button"
          className={boton}
          aria-label={`Poner ${itemLabel} en el primer lugar`}
          title={firstLabel}
          onClick={() => onMove(0)}
        >
          <PanelLeft className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        className={boton}
        aria-label={`Mover ${itemLabel} una posición antes`}
        title="Mover antes"
        disabled={index === 0}
        onClick={() => onMove(index - 1)}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={boton}
        aria-label={`Mover ${itemLabel} una posición después`}
        title="Mover después"
        disabled={index === total - 1}
        onClick={() => onMove(index + 1)}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
      <span className="ml-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
        {index + 1}/{total}
      </span>
    </div>
  );
}
