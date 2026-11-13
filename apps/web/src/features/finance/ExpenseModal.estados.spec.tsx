import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/overlays';

/**
 * EL TERCER ESTADO EN EL ALTA DE UNA COMPRA («solo pedido especial», 13/11).
 *
 * ⚠️ El desplegable «Elegir material» rotula las fichas que no están activas y
 * avisa cuándo comprar REACTIVA la ficha. Con `=== 'DISCONTINUED'`, una ficha
 * «solo pedido especial» salía sin rótulo (parecía una activa) y el aviso no
 * distinguía entre «comprar la reactiva» y «comprar NO la reactiva».
 *
 * La decisión que se fija acá: comprar para un encargo puntual NO reactiva una
 * ficha «solo pedido especial» (ver `estadoTrasComprar`), así que el aviso de
 * «vuelve a estar activa» NO debe salir para ella.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.del },
  apiErrorMessage: () => 'falló',
  downloadFile: vi.fn(),
  getToken: () => null,
}));

const { ExpenseModal } = await import('@/features/finance/ExpenseModal');

const FICHAS = [
  { id: 'm1', name: 'PLA Amarillo', status: 'ACTIVE' },
  { id: 'm2', name: 'PLA Blanco', status: 'DISCONTINUED' },
  { id: 'm3', name: 'PLA Dorado', status: 'SOLO_PEDIDO_ESPECIAL' },
];

function montar() {
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/materials') return { data: FICHAS };
    return { data: [] };
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <ExpenseModal tipoFijo="filament" onClose={() => {}} onSaved={() => {}} />
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: /Del catálogo/ }));
}

/** Abre el desplegable de fichas, espera a que lleguen y devuelve sus textos. */
async function opciones() {
  const trigger = await screen.findByRole('combobox', { name: /Elegir/ });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  await screen.findByRole('option', { name: /PLA Amarillo/ });
  return screen.getAllByRole('option').map((o) => o.textContent);
}

beforeEach(() => mocks.get.mockReset());

describe('ExpenseModal — las fichas y su estado', () => {
  it('cada ficha se rotula con SU estado; la activa va sin rótulo', async () => {
    montar();

    expect(await opciones()).toEqual([
        'Elegir…',
        'PLA Amarillo',
        'PLA Blanco (descontinuado)',
        'PLA Dorado (solo pedido especial)',
      ]);
  });

  // Hermano: la descontinuada SÍ avisa que comprar la reactiva.
  it('elegir una DESCONTINUADA avisa que al comprar vuelve a estar activa', async () => {
    montar();
    await opciones();
    fireEvent.click(screen.getByRole('option', { name: 'PLA Blanco (descontinuado)' }));

    expect(screen.getByText(/vuelve a estar activa/)).toBeInTheDocument();
  });

  it('elegir una «solo pedido especial» NO dice que se reactiva (comprar no cambia su estado)', async () => {
    montar();
    await opciones();
    fireEvent.click(screen.getByRole('option', { name: 'PLA Dorado (solo pedido especial)' }));

    expect(screen.queryByText(/vuelve a estar activa/)).toBeNull();
  });
});
