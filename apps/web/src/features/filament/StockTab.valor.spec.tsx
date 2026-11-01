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
 * PANTALLA muestra la plata, y sobre todo si la muestra **cuando no debe**:
 * el valor es una ESTIMACIÓN —el conteo no sabe gramos— así que un número
 * solo, sin el rango ni el desglose, se lee como si estuviera medido.
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
    lastRollPrice: 20,
    received: null,
  },
];

const VALOR: ValorDelInventario = {
  sellados: 20,
  enUso: 20,
  porAcabarse: 11,
  total: 51,
  piso: 20,
  techo: 148,
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
  it('muestra cuánto vale en dinero', async () => {
    const { cargar } = montar();
    await cargar();
    expect(screen.getByText('$51.00')).toBeInTheDocument();
  });

  // ⚠️ El rango es lo que impide leer la estimación como una medición: el
  // conteo no sabe gramos, así que el valor real está entre los dos extremos.
  it('muestra el rango: el piso y el techo', async () => {
    const { cargar } = montar();
    await cargar();
    expect(screen.getByText(/\$20\.00.*\$148\.00/)).toBeInTheDocument();
  });

  // ⚠️ Sin el desglose la estimación es una caja negra: no se puede ver que el
  // número sale de contar los abiertos a mitad de precio.
  it('muestra de dónde sale: las tres partes con su porcentaje', async () => {
    const { cargar } = montar();
    await cargar();
    expect(screen.getByText(/Sellados/)).toBeInTheDocument();
    expect(screen.getByText(/50 %/)).toBeInTheDocument();
    expect(screen.getByText(/12\.5 %/)).toBeInTheDocument();
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
