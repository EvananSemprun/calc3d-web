import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MaterialItem } from '@/features/calculator/useCatalogData';

/**
 * EL SELECTOR DE FILAMENTO, RENDERIZADO (2026-10-10).
 *
 * ⚠️ **Este archivo existe porque los tests de función pura no alcanzan.**
 * `materialOptions.spec.ts` prueba las nueve ramas de cada función, y aun así
 * nadie se enteraría si la pantalla llamara a `textoDeOrigen` con la lista
 * equivocada, o si el aviso de la ficha sin precio no se dibujara nunca. Ya
 * pasó en esta misma pasada con el filtro de Gastos: una mutación que hacía
 * que la pantalla **dejara de filtrar** no tumbaba ni un test.
 *
 * Lo que se mide acá es EL CABLEADO: que el número y su explicación salgan del
 * mismo lugar, y que elegir una opción cambie lo que se lee.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: vi.fn(), delete: vi.fn() },
  apiErrorMessage: () => 'falló',
  downloadFile: vi.fn(),
  getToken: () => null,
}));

const { CalculatorProvider } = await import('@/features/calculator/CalculatorProvider');
const { SectionFilamento } = await import('@/features/calculator/sections');

/**
 * Los dos tipos que devuelve `GET /filament/type-prices`, tal como los deja
 * `preciosPorTipo`: el PLA con compras DENTRO de la ventana de 6 meses y el ABS
 * sin ninguna, apoyado en su última compra (`stale`).
 */
const TIPOS = [
  {
    type: 'PLA',
    rollPrice: 20.26,
    rollGrams: 1000,
    rolls: 47,
    purchases: 12,
    stale: false,
    lastPurchase: '2026-08-31',
  },
  {
    type: 'ABS',
    rollPrice: 15,
    rollGrams: 1000,
    rolls: 2,
    purchases: 1,
    stale: true,
    lastPurchase: '2026-01-15',
  },
];

/** La ficha del regalo es REAL: `PLA Creality Azul oscuro` costó $0. */
const FICHAS: MaterialItem[] = [
  { id: 'm1', name: 'PLA Azul', rollPrice: '20', rollGrams: 1000, status: 'ACTIVE', outAtLastClose: null },
  {
    id: 'pure',
    name: 'PLA PURE Blanco',
    rollPrice: '13',
    rollGrams: 1000,
    status: 'ACTIVE',
    outAtLastClose: null,
  },
  {
    id: 'regalo',
    name: 'PLA Creality Azul oscuro',
    rollPrice: '0',
    rollGrams: 1000,
    status: 'ACTIVE',
    outAtLastClose: null,
  },
];

function montar() {
  mocks.get.mockImplementation((url: string) => {
    if (url === '/filament/type-prices') return Promise.resolve({ data: TIPOS });
    if (url === '/materials') return Promise.resolve({ data: FICHAS });
    if (url === '/printers' || url === '/components' || url === '/clients') {
      return Promise.resolve({ data: [] });
    }
    // Sin ajustes, `useMoney` cae a USD/en-US. `null` y no `undefined`: React
    // Query rechaza `undefined` como dato de una consulta.
    return Promise.resolve({ data: null });
  });
  mocks.post.mockResolvedValue({ data: null });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CalculatorProvider>
        <SectionFilamento />
      </CalculatorProvider>
    </QueryClientProvider>,
  );
}

/** Abre un desplegable de Radix y elige una opción por su texto. */
function elegir(etiqueta: string, opcion: string | RegExp) {
  fireEvent.keyDown(screen.getByLabelText(etiqueta), { key: 'Enter' });
  fireEvent.click(screen.getByText(opcion));
}

describe('Filamento: de dónde sale el precio', () => {
  beforeEach(() => mocks.get.mockReset());

  it('al abrir arranca en el tipo que más se compra y dice que es el promedio de la ventana', async () => {
    montar();

    // El renglón sale del MISMO `PrecioPorTipo` que puso el número en el campo:
    // si la pantalla le pasara otra lista a `textoDeOrigen`, esto no aparece.
    expect(
      await screen.findByText(
        'Promedio de PLA de los últimos 6 meses, sobre 47 rollos comprados. El rollo regalado no cuenta.',
      ),
    ).toBeInTheDocument();
  });

  it('al elegir un tipo que no se compra hace rato, el renglón lo dice DISTINTO', async () => {
    montar();
    await screen.findByText(/Promedio de PLA/);

    elegir('Tipo de filamento', /^ABS — promedio/);

    expect(
      screen.getByText(
        'ABS no se compra desde enero de 2026: es el precio de esa última compra, no un promedio de los últimos 6 meses.',
      ),
    ).toBeInTheDocument();
    // Y deja de afirmar que es un promedio de la ventana.
    expect(screen.queryByText(/Promedio de ABS/)).not.toBeInTheDocument();
  });
});

describe('Filamento: la ficha sin precio', () => {
  beforeEach(() => mocks.get.mockReset());

  it('está en la lista, marcada, y la barata NO', async () => {
    montar();
    await screen.findByText(/Promedio de PLA/);

    fireEvent.keyDown(screen.getByLabelText('Color exacto (ficha)'), { key: 'Enter' });

    // Sigue ofreciéndose: esconderla taparía un dato que hay que ver.
    expect(
      screen.getByText('PLA Creality Azul oscuro — sin precio: su compra fue en $0'),
    ).toBeInTheDocument();
    // ⚠️ El PLA PURE a $13 es un precio REAL: no se marca. El criterio es
    // "no tiene precio", no "es barato".
    expect(screen.getByText('PLA PURE Blanco — $13.00')).toBeInTheDocument();
  });

  it('al elegirla, la pantalla AVISA que el material va en cero', async () => {
    montar();
    await screen.findByText(/Promedio de PLA/);

    elegir('Color exacto (ficha)', /PLA Creality Azul oscuro/);

    const aviso = screen.getByRole('alert');
    expect(aviso).toHaveTextContent(/no tiene precio/);
    expect(aviso).toHaveTextContent(/GRATIS/);
    expect(aviso).toHaveTextContent(/a mano/);
  });

  it('al elegir una ficha CON precio no hay ningún aviso', async () => {
    montar();
    await screen.findByText(/Promedio de PLA/);

    elegir('Color exacto (ficha)', 'PLA PURE Blanco — $13.00');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Precio de la última compra de esa ficha.')).toBeInTheDocument();
  });
});
