import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/overlays';
import { errorDeConciliacion } from '@/features/cash/aviso-de-conciliacion.ayuda';

/**
 * EL AVISO DE CONCILIACIÓN EN GASTOS — las DOS puertas de esta pantalla.
 *
 * `ExpenseModal` manda a dos endpoints distintos y los dos pasan por el candado:
 * `/expenses` (el gasto suelto) y `/expenses/with-definition` (la compra de
 * filamento o insumo, que además toca un catálogo). Una sola de las dos cableada
 * dejaría la otra en el callejón sin salida, y desde la pantalla se ven iguales.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() }));
const notificado = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.del },
  apiErrorMessage: () => 'falló',
  downloadFile: vi.fn(),
  getToken: () => null,
}));
vi.mock('@/components/toast', () => ({ notify: notificado, Toaster: () => null }));

const { ExpenseModal } = await import('@/features/finance/ExpenseModal');

const FICHAS = [{ id: 'm1', name: 'PLA Amarillo', status: 'ACTIVE' }];

function montar(tipoFijo?: 'filament') {
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/materials') return { data: FICHAS };
    return { data: [] };
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <ExpenseModal tipoFijo={tipoFijo} onClose={() => {}} onSaved={() => {}} />
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

/** Llena lo mínimo para que el botón se encienda y guarda. */
async function guardar() {
  const monto = screen.getByRole('spinbutton', { name: /Monto/ });
  fireEvent.change(monto, { target: { value: '25' } });
  const desc = screen.queryByRole('textbox', { name: /Descripción|Concepto/ });
  if (desc) fireEvent.change(desc, { target: { value: 'Prueba' } });
  fireEvent.click(screen.getByRole('button', { name: /^Guardar$/ }));
}

/**
 * Elige una ficha YA EXISTENTE del catálogo. Es lo que habilita el camino de
 * `/expenses/with-definition`; sin esto el botón queda apagado (`canSave`
 * exige ficha o nombre nuevo) y el formulario no manda nada.
 */
async function elegirFicha() {
  fireEvent.click(screen.getByRole('button', { name: /Del catálogo/ }));
  const trigger = await screen.findByRole('combobox', { name: /Elegir/ });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  fireEvent.click(await screen.findByRole('option', { name: 'PLA Amarillo' }));
}

const posts = (ruta: string) => mocks.post.mock.calls.filter((c) => String(c[0]) === ruta);

beforeEach(() => {
  mocks.get.mockReset();
  mocks.post.mockReset();
  notificado.error.mockReset();
});

describe('Gastos: el aviso de conciliación tiene salida en las DOS puertas', () => {
  it('/expenses: el 400 dibuja «Guardar igual» y reenvía con la confirmación', async () => {
    mocks.post.mockRejectedValueOnce(errorDeConciliacion()).mockResolvedValue({ data: {} });
    montar();
    await guardar();

    expect(await screen.findByText(/fecha igual o anterior/)).toBeInTheDocument();
    expect(notificado.error).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar igual' }));

    await vi.waitFor(() => expect(posts('/expenses')).toHaveLength(2));
    expect(posts('/expenses')[0][1]).toMatchObject({ confirmoConciliacion: false });
    expect(posts('/expenses')[1][1]).toMatchObject({ confirmoConciliacion: true });
  });

  it('/expenses/with-definition: la compra de filamento también reenvía', async () => {
    mocks.post.mockRejectedValueOnce(errorDeConciliacion()).mockResolvedValue({ data: {} });
    montar('filament');
    await elegirFicha();
    await guardar();

    fireEvent.click(await screen.findByRole('button', { name: 'Guardar igual' }));

    const ruta = '/expenses/with-definition';
    await vi.waitFor(() => expect(posts(ruta)).toHaveLength(2));
    // ⚠️ El flag va al NIVEL SUPERIOR, no dentro de `expense`: así lo pide
    // `ExpenseWithDefinitionSchema`.
    expect(posts(ruta)[0][1]).toMatchObject({ confirmoConciliacion: false });
    expect(posts(ruta)[1][1]).toMatchObject({ confirmoConciliacion: true });
  });
});
