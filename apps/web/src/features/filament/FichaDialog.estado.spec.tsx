import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { StockCountRow } from '@calc3d/shared';
import { ConfirmProvider, TooltipProvider } from '@/components/overlays';

/**
 * EL BOTÓN DE ESTADO DE LA FICHA CON TRES ESTADOS (13/11).
 *
 * El botón alternaba solo entre «Descontinuar» y «Reactivar» según
 * `status === 'DISCONTINUED'`: una ficha «solo pedido especial» ofrecía
 * «Descontinuar», como si estuviera en circulación normal. Ahora ofrece
 * «Reactivar» (volver a la reposición y al conteo), y la activa sigue
 * ofreciendo «Descontinuar».
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.del },
  apiErrorMessage: () => 'falló',
  downloadFile: vi.fn(),
  getToken: () => null,
}));

const { FichaDialog } = await import('@/features/filament/FichaDialog');

const fila = (status: StockCountRow['status']): StockCountRow => ({
  materialId: 'm1',
  name: 'PLA Dorado',
  type: 'PLA',
  brand: 'Eryone',
  color: 'Dorado',
  status,
  sealed: 0,
  inUse: 0,
  running: 0,
  total: 0,
  needsBrandCheck: false,
  counted: true,
  canDelete: false,
  exhausted: false,
  previous: null,
  lastRollPrice: 20,
  received: null,
});

function montar(status: StockCountRow['status']) {
  mocks.get.mockResolvedValue({ data: [] });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <ConfirmProvider>
            <FichaDialog fila={fila(status)} onClose={() => {}} />
          </ConfirmProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('FichaDialog — el botón de estado', () => {
  it('una ficha ACTIVA ofrece Descontinuar', () => {
    montar('ACTIVE');
    expect(screen.getByRole('button', { name: 'Descontinuar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reactivar' })).toBeNull();
  });

  it('una DESCONTINUADA ofrece Reactivar', () => {
    montar('DISCONTINUED');
    expect(screen.getByRole('button', { name: 'Reactivar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descontinuar' })).toBeNull();
  });

  it('una «solo pedido especial» ofrece Reactivar, no Descontinuar', () => {
    montar('SOLO_PEDIDO_ESPECIAL');
    expect(screen.getByRole('button', { name: 'Reactivar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descontinuar' })).toBeNull();
  });
});
