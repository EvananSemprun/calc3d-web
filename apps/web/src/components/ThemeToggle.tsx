import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/theme/ThemeProvider';
import { cn } from '@/lib/utils';

/** Botón para alternar entre modo claro y oscuro. */
export function ThemeToggle({ className, withLabel = false }: { className?: string; withLabel?: boolean }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={isDark ? 'Modo claro' : 'Modo oscuro'}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border border-input bg-background/40 px-3 py-2 text-sm text-muted-foreground backdrop-blur-sm transition-all hover:border-brand-yellow/40 hover:bg-accent hover:text-foreground',
        className,
      )}
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-brand-yellow-ink" />
      ) : (
        <Moon className="h-4 w-4 text-brand-blue-bright" />
      )}
      {withLabel && <span>{isDark ? 'Claro' : 'Oscuro'}</span>}
    </button>
  );
}
