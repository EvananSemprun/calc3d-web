import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * EL BLOQUE «A PROVEEDORES», RENDERIZADO (fase B, tarea 2).
 *
 * Con las tres facturas abiertas de producción (nada llegó, todo pedido) el
 * bloque tiene que decir $0 de deuda y $334 comprometidos. ⚠️ Y un proveedor que
 * solo tiene compromiso no puede aparecer como un grupo en cero: tiene que
 * mostrar su compromiso como columna propia.
 *
 * Se mockea `@/lib/api` y nada más.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  apiErrorMessage: () => 'falló',
  downloadFile: vi.fn(),
  getToken: () => null,
}));

const { LoansPage } = await import('@/pages/Loans');
const { ConfirmProvider } = await import('@/components/overlays');

const grupo = (over: Record<string, unknown>) => ({
  supplierId: 'prov-a',
  supplierName: 'StratoFill',
  total: 0,
  facturas: 0,
  comprometido: 0,
  facturasComprometidas: 0,
  aFavor: 0,
  facturasAFavor: 0,
  ...over,
});

const overview = () => ({
  loans: [],
  owner: {
    counterparty: { id: 'cp', name: 'Propietario', kind: 'OWNER' },
    obligations: [],
    total: 0,
    applicationOrder: 'OLDEST_FIRST',
  },
  suppliers: {
    groups: [
      grupo({ comprometido: 254, facturasComprometidas: 2 }),
      grupo({
        supplierId: 'prov-b',
        supplierName: 'Filamentos del Sur',
        comprometido: 80,
        facturasComprometidas: 1,
      }),
    ],
    total: 0,
    aFavor: 0,
    comprometido: 334,
    facturasComprometidas: 3,
  },
  totals: { prestamista: 0, propietario: 0, proveedores: 0, comprometido: 334, total: 0 },
});

function montar() {
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/loans/overview') return { data: overview() };
    if (url === '/counterparties') return { data: [] };
    return { data: null };
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ConfirmProvider>
          <LoansPage />
        </ConfirmProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => mocks.get.mockReset());

describe('Deuda: «A proveedores» y «Comprometido»', () => {
  it('el total muestra «A proveedores» en 0 y «Comprometido» en 334, aparte', async () => {
    montar();

    await screen.findByText('Lo que debe el negocio');
    const aProv = screen.getByText('A proveedores').closest('div')!;
    expect(aProv.textContent).toMatch(/\$0([.,]00)?$/);
    expect(aProv.textContent).not.toMatch(/334/);

    // «Comprometido» también es el encabezado de la tabla: la fila del total es la `dt`.
    const dt = screen.getAllByText('Comprometido').find((n) => n.tagName === 'DT')!;
    expect(dt.closest('div')!.textContent).toMatch(/334/);
  });

  it('un proveedor SOLO con compromiso muestra su compromiso en su columna', async () => {
    montar();

    await screen.findByText('Lo que le debes a los proveedores');
    const filas = (await screen.findAllByText('StratoFill')).map((n) => n.closest('tr')).filter(Boolean);
    expect(filas).toHaveLength(1);
    expect(filas[0]!.textContent).toMatch(/254/);
    expect(filas[0]!.textContent).toMatch(/2 facturas/);
    // La cuenta de facturas con DEUDA es 0: no tiene que decir «0 facturas sin pagar».
    expect(filas[0]!.textContent).not.toMatch(/sin facturas pendientes/i);
  });

  it('el bloque dice que lo comprometido no es deuda, con su monto, y el total lo repite', async () => {
    montar();

    await screen.findByText('Lo que le debes a los proveedores');
    // Anclado al párrafo del bloque, no a un texto que también está en la cabecera.
    const linea = screen.getByText(/Comprometido \(pedido y sin recibir\)/);
    expect(linea.tagName).toBe('P');
    expect(linea.textContent).toMatch(/334/);
    expect(linea.textContent).toMatch(/No se debe todavía/);
    // El bloque rotula la deuda real como lo recibido y sin pagar.
    expect(screen.getByText('Recibido y sin pagar')).toBeTruthy();
  });

  it('una factura parcialmente recibida avisa que cuenta en las dos cuentas', async () => {
    mocks.get.mockImplementation(async (url: string) => {
      if (url === '/loans/overview') {
        const o = overview();
        o.suppliers.groups = [
          grupo({ total: 12, facturas: 1, comprometido: 30, facturasComprometidas: 1 }),
        ];
        return { data: o };
      }
      return { data: url === '/counterparties' ? [] : null };
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ConfirmProvider>
            <LoansPage />
          </ConfirmProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    const fila = (await screen.findAllByText('StratoFill')).map((n) => n.closest('tr')).find(Boolean)!;
    expect(fila.textContent).toMatch(/una misma factura puede estar en las dos/);
  });
});
