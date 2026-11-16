import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StockCountRow, ValorDelInventario } from '@calc3d/shared';
import { TooltipProvider } from '@/components/overlays';

/**
 * CUÁNTO VALE EL FILAMENTO QUE QUEDA (2026-11-01).
 *
 * ⚠️ La cuenta ya está probada en `valor-inventario.spec.ts` (shared) y su
 * cableado en el servicio. Lo que ninguna de las dos puede ver es si la
 * PANTALLA dice lo que debe y NO dice lo que no debe.
 *
 * La regla es la contraria a la de la primera versión: el número YA NO se
 * estima. Vale lo que está medido; lo que no está medido vale 0 y se avisa.
 * Por eso la tarjeta no muestra rango ni porcentajes (eran fracciones
 * inventadas) y sí el aviso de cuántos rollos quedaron afuera.
 *
 * Se mockea `@/lib/api` y nada más.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.del },
  apiErrorMessage: () => 'falló',
  downloadFile: vi.fn(),
  getToken: () => null,
}));

const { StockTab } = await import('@/features/filament/StockTab');

const FILAS: StockCountRow[] = [
  {
    materialId: 'm1',
    name: 'PLA Amarillo',
    type: 'PLA',
    brand: 'Creality',
    color: 'Amarillo',
    status: 'ACTIVE',
    sealed: 1,
    inUse: 2,
    running: 0,
    total: 3,
    needsBrandCheck: false,
    counted: true,
    canDelete: false,
    exhausted: false,
    previous: null,
    carretesPrevios: null,
    lastRollPrice: 20,
    received: null,
  },
];

const VALOR: ValorDelInventario = {
  sellados: 20,
  abiertosPesados: 0,
  total: 20,
  rollosSinPesar: 6,
  sinPrecio: 0,
};

function montar(opts: { cerrado?: boolean; valor?: ValorDelInventario } = {}) {
  const cerrado = opts.cerrado ?? true;
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/filament/stock') return { data: FILAS };
    if (url === '/filament/stock/status') {
      return {
        data: {
          month: '2026-10',
          closed: cerrado,
          closedAt: cerrado ? '2026-10-31T12:00:00.000Z' : null,
          reopenedAt: null,
          canClose: true,
          closableFrom: '2026-10-31',
        },
      };
    }
    if (url === '/filament/summary') {
      return {
        data: {
          month: '2026-10',
          totalRolls: 3,
          running: 0,
          consumption: null,
          purchased: 0,
          restock: [],
          pendingBrandCheck: 0,
          countedColors: 1,
          totalColors: 1,
          averagePurchased: 1,
          valor: opts.valor ?? VALOR,
          complete: cerrado,
        },
      };
    }
    return { data: null };
  });

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const vista = render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <StockTab />
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  /**
   * ⚠️ Espera por algo que SOLO existe con los datos ya cargados. Con dos
   * `act` sueltos la carga era una carrera: el primer test veía el esqueleto
   * y los `queryByText(...).not` pasaban sin que se renderizara nada.
   */
  const cargar = async () => {
    if (cerrado) await screen.findByText('Rollos en total');
    else await screen.findByText(/Cuando cierres/);
    await act(async () => {});
  };
  return { ...vista, cargar };
}

beforeEach(() => {
  mocks.get.mockReset();
  localStorage.clear();
});

describe('Valor del filamento que queda', () => {
  it('muestra cuánto vale en dinero y de dónde sale', async () => {
    const { cargar } = montar();
    await cargar();
    expect(screen.getByText('$20.00')).toBeInTheDocument();
    expect(screen.getByText(/Sellados \$20\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Abiertos pesados \$0\.00/)).toBeInTheDocument();
  });

  it('avisa cuántos rollos empezados no entran en el total', async () => {
    const { cargar } = montar();
    await cargar();
    expect(screen.getByText(/6 rollo\(s\) empezado\(s\) todavía no se pueden pesar/)).toBeInTheDocument();
  });

  it('sin rollos sin pesar no mete ese aviso', async () => {
    const { cargar } = montar({ valor: { ...VALOR, rollosSinPesar: 0 } });
    await cargar();
    expect(screen.queryByText(/sin pesar|no se pueden pesar/)).not.toBeInTheDocument();
  });

  // ⚠️ El que importa: impide que alguien devuelva las fracciones inventadas
  // (un rango piso-techo o los porcentajes de «un rollo abierto vale la mitad»).
  it('NO muestra un rango ni un porcentaje', async () => {
    const { cargar, container } = montar();
    await cargar();
    expect(screen.queryByText(/Estimado|entre \$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d\s?%/)).not.toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(/Estimado|\d(\.\d)? %/);
  });

  it('avisa de los rollos que no pudo valorar', async () => {
    const { cargar } = montar({ valor: { ...VALOR, sinPrecio: 3 } });
    await cargar();
    expect(screen.getByText(/3 rollo\(s\) sin precio/)).toBeInTheDocument();
  });

  it('sin rollos sin precio no mete ese aviso', async () => {
    const { cargar } = montar();
    await cargar();
    expect(screen.queryByText(/sin precio/)).not.toBeInTheDocument();
  });

  // ⚠️ Lo más importante: con el mes ABIERTO el conteo está a medio hacer, así
  // que cualquier plata que se muestre es inventada.
  it('con el mes abierto no muestra plata', async () => {
    const { cargar } = montar({ cerrado: false });
    await cargar();
    expect(screen.queryByText(/Valor del filamento/)).not.toBeInTheDocument();
  });
});
