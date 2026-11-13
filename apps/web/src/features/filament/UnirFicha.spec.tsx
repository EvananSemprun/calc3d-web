import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StockCountRow, UnionVista } from '@calc3d/shared';
import { ConfirmProvider, TooltipProvider } from '@/components/overlays';

/**
 * UNIR dos fichas duplicadas (13/11): la confirmación ENUMERA lo que se mueve, dice
 * el precio que queda y que no se puede deshacer, y el botón solo se habilita con
 * la vista previa cargada. Se mockea `@/lib/api` y nada más.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.del },
  apiErrorMessage: () => 'falló',
  downloadFile: vi.fn(),
  getToken: () => null,
}));

const { filasDeLaUnion } = await import('@/features/filament/unir');
const { FichaDialog } = await import('@/features/filament/FichaDialog');
const { UnirFichaDialog } = await import('@/features/filament/UnirFichaDialog');

const money = (n: number) => `$${n.toFixed(2)}`;

const vistaDe = (extra: Partial<UnionVista> = {}): UnionVista => ({
  origen: { id: 'm1', name: 'Argollas' },
  destino: { id: 'm2', name: 'Argolla llavero' },
  compras: 1,
  lineasDeFactura: 0,
  productos: 2,
  conteos: 3,
  conteosQueSeSuman: 1,
  precio: { antes: 0.5, despues: 0.2908, deLaUltimaCompra: true },
  ...extra,
});

describe('filasDeLaUnion', () => {
  it('enumera TODO lo que se mueve, incluso lo que vale cero, y dice que no se deshace', () => {
    const textos = filasDeLaUnion(vistaDe({ lineasDeFactura: 0 }), 'material', money).map((f) => f.texto);

    expect(textos.join('\n')).toContain('1 compra pasa a «Argolla llavero»');
    expect(textos.join('\n')).toContain('No cambia ningún monto ni ninguna fecha');
    expect(textos.join('\n')).toContain('0 líneas de factura pasan');
    expect(textos.join('\n')).toContain('3 conteos de rollos pasan');
    expect(textos.join('\n')).toContain('En 1 mes las dos fichas tenían conteo: se SUMAN');
    expect(textos.join('\n')).toContain('2 costeos de productos de la tienda cambian de nombre');
    expect(textos.join('\n')).toContain('«Argollas» se borra. Unir NO se puede deshacer.');
  });

  it('dice el precio que va a quedar y el de hoy', () => {
    const textos = filasDeLaUnion(vistaDe(), 'insumo', money).map((f) => f.texto).join('\n');

    expect(textos).toContain('queda en $0.29 (hoy $0.50)');
    expect(textos).toContain('por unidad');
  });

  it('sin compra con cantidad dice que el precio se queda, no que cambia', () => {
    const textos = filasDeLaUnion(vistaDe({ precio: { antes: 0.5, despues: 0.5, deLaUltimaCompra: false } }), 'insumo', money)
      .map((f) => f.texto)
      .join('\n');

    expect(textos).toContain('se queda en $0.50');
    expect(textos).not.toContain('queda en $0.29');
  });

  it('en insumos no hay conteos de rollos', () => {
    const claves = filasDeLaUnion(vistaDe(), 'insumo', money).map((f) => f.clave);

    expect(claves).not.toContain('conteos');
    expect(filasDeLaUnion(vistaDe(), 'material', money).map((f) => f.clave)).toContain('conteos');
  });
});

const ficha = (id: string, name: string, rollGrams: number) => ({ id, name, brand: 'Eryone', rollGrams });
const FICHAS = [ficha('m1', 'PLA Rojo', 1000), ficha('m2', 'PLA Rojo (dup)', 1000), ficha('m3', 'PLA Azul 750', 750)];

function montar(ui: React.ReactElement, vista: UnionVista = vistaDe()) {
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/materials' || url === '/components') return { data: FICHAS };
    if (url.endsWith('/unir')) return { data: vista };
    return { data: [] };
  });
  mocks.patch.mockResolvedValue({ data: vista });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <ConfirmProvider>{ui}</ConfirmProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const abrirDestinos = () => fireEvent.keyDown(screen.getByRole('combobox', { name: 'Unir con' }), { key: 'Enter' });

beforeEach(() => {
  mocks.get.mockReset();
  mocks.patch.mockReset();
});

describe('UnirFichaDialog', () => {
  it('antes de elegir destino no hay vista ni se puede unir', async () => {
    montar(<UnirFichaDialog tipo="material" origen={{ id: 'm1', name: 'PLA Rojo' }} onClose={() => {}} />);

    expect(await screen.findByRole('combobox', { name: 'Unir con' })).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Lo que va a pasar' })).toBeNull();
    expect((screen.getByRole('button', { name: /Unir y borrar/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.get).not.toHaveBeenCalledWith(expect.stringContaining('/unir'), expect.anything());
  });

  it('ofrece solo fichas del mismo peso de rollo y nunca la misma ficha', async () => {
    montar(<UnirFichaDialog tipo="material" origen={{ id: 'm1', name: 'PLA Rojo' }} onClose={() => {}} />);
    await screen.findByRole('combobox', { name: 'Unir con' });
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('/materials'));
    abrirDestinos();

    const opciones = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(opciones.some((t) => t?.includes('PLA Rojo (dup)'))).toBe(true); // hermano: la compatible sí
    expect(opciones.some((t) => t?.includes('PLA Azul 750'))).toBe(false);
    expect(opciones.some((t) => t === 'PLA Rojo · Eryone')).toBe(false);
  });

  it('al elegir destino pide la vista previa y la dibuja entera; unir manda el PATCH con el destino', async () => {
    const onClose = vi.fn();
    montar(<UnirFichaDialog tipo="material" origen={{ id: 'm1', name: 'PLA Rojo' }} onClose={onClose} />);
    await screen.findByRole('combobox', { name: 'Unir con' });
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('/materials'));
    abrirDestinos();
    fireEvent.click(await screen.findByRole('option', { name: /PLA Rojo \(dup\)/ }));

    const lista = await screen.findByRole('list', { name: 'Lo que va a pasar' });
    expect(within(lista).getAllByRole('listitem').length).toBe(6);
    expect(lista.textContent).toContain('Unir NO se puede deshacer');
    expect(mocks.get).toHaveBeenCalledWith('/materials/m1/unir', { params: { destinoId: 'm2' } });

    fireEvent.click(screen.getByRole('button', { name: /Unir y borrar/ }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith('/materials/m1/unir', { destinoId: 'm2' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('insumos: usa la ruta de componentes y no habla de conteos', async () => {
    montar(<UnirFichaDialog tipo="insumo" origen={{ id: 'm1', name: 'Argollas' }} onClose={() => {}} />);
    await screen.findByRole('combobox', { name: 'Unir con' });
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('/components'));
    abrirDestinos();
    fireEvent.click(await screen.findByRole('option', { name: /PLA Rojo \(dup\)/ }));

    const lista = await screen.findByRole('list', { name: 'Lo que va a pasar' });
    expect(lista.textContent).not.toContain('conteo');
    fireEvent.click(screen.getByRole('button', { name: /Unir y borrar/ }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith('/components/m1/unir', { destinoId: 'm2' }));
  });
});

describe('FichaDialog — Unir con otra ficha', () => {
  const fila: StockCountRow = {
    materialId: 'm1',
    name: 'PLA Rojo',
    type: 'PLA',
    brand: 'Eryone',
    color: 'Rojo',
    status: 'ACTIVE',
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
  };

  it('la ficha ofrece el botón, también cuando tiene historial y no se puede borrar', async () => {
    montar(<FichaDialog fila={fila} onClose={() => {}} />);

    fireEvent.click(await screen.findByRole('button', { name: /Unir con otra ficha/ }));

    expect(await screen.findByRole('combobox', { name: 'Unir con' })).toBeTruthy();
  });
});
