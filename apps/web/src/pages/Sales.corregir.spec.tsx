import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/overlays';

/**
 * CORREGIR UNA VENTA DE MOSTRADOR (2026-11-07).
 *
 * Hasta hoy una venta mal cargada solo se podía borrar y volver a cargar. El
 * endpoint `PATCH /sales/:id` existía **desde siempre** y el panel no lo
 * usaba: lo que faltaba era la pantalla, no el backend.
 *
 * ⚠️ Lo que estos tests cuidan es que corregir **no cambie el canal**. Las 25
 * ventas `ENCARGO` son el histórico semanal del Excel; mandarles `kind:
 * 'COUNTER'` las convertiría en ventas de mostrador y el reparto por canal del
 * Dashboard empezaría a contar como mostrador plata que entró por encargos.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.del },
  apiErrorMessage: () => 'falló',
  downloadFile: vi.fn(),
  getToken: () => null,
}));

const { SalesPage } = await import('@/pages/Sales');

const VENTA = {
  id: 'v1',
  date: '2026-11-03T00:00:00.000Z',
  amount: 12.5,
  kind: 'COUNTER',
  note: 'llaveros',
  client: null,
  originChannel: null,
  campaignId: null,
};

function montar() {
  mocks.get.mockImplementation((url: string) => {
    if (url === '/sales') return Promise.resolve({ data: [VENTA] });
    if (url === '/clients' || url === '/campaigns') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: null });
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <SalesPage />
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

/**
 * Abre el modal de corrección. ⚠️ En jsdom no hay CSS, así que la tabla y las
 * tarjetas del teléfono se dibujan LAS DOS: el lápiz aparece dos veces y hay
 * que elegir uno a propósito.
 */
async function abrirCorregir() {
  montar();
  const lapices = await screen.findAllByRole('button', { name: 'Corregir venta' });
  expect(lapices).toHaveLength(2); // tabla + tarjeta: si alguna pierde el botón, se cae
  fireEvent.click(lapices[0]);
  return await screen.findByRole('button', { name: 'Guardar cambios' });
}

const cuerpoDelPatch = () => {
  const llamada = mocks.patch.mock.calls.find((c) => String(c[0]).startsWith('/sales/'));
  if (!llamada) throw new Error('no se mandó ninguna corrección');
  return { url: llamada[0] as string, cuerpo: llamada[1] as Record<string, unknown> };
};

describe('Corregir una venta de mostrador', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset().mockResolvedValue({ data: {} });
    mocks.patch.mockReset().mockResolvedValue({ data: {} });
  });

  it('abre el formulario con lo que estaba guardado', async () => {
    await abrirCorregir();
    expect(screen.getByDisplayValue('llaveros')).toBeInTheDocument();
    expect(screen.getByDisplayValue('12.5')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-11-03')).toBeInTheDocument();
  });

  it('manda un PATCH a esa venta y NO crea una nueva', async () => {
    const guardar = await abrirCorregir();
    fireEvent.click(guardar);
    expect(cuerpoDelPatch().url).toBe('/sales/v1');
    expect(mocks.post).not.toHaveBeenCalled();
  });

  /** ⚠️ El que importa: corregir no puede cambiar el canal de la venta. */
  it('NO manda el canal: corregir no convierte un encargo en mostrador', async () => {
    const guardar = await abrirCorregir();
    fireEvent.click(guardar);
    expect('kind' in cuerpoDelPatch().cuerpo).toBe(false);
  });

  it('guarda el monto corregido', async () => {
    const guardar = await abrirCorregir();
    fireEvent.change(screen.getByDisplayValue('12.5'), { target: { value: '20' } });
    fireEvent.click(guardar);
    expect(cuerpoDelPatch().cuerpo.amount).toBe(20);
  });

  /**
   * El hermano alcanzable: registrar una venta nueva SÍ manda el canal, y por
   * POST. Sin este test, un modal que no mandara nunca `kind` pasaría igual.
   */
  it('registrar una venta nueva sigue mandando POST con el canal', async () => {
    montar();
    fireEvent.click((await screen.findAllByRole('button', { name: /Registrar venta de mostrador/ }))[0]);
    fireEvent.change(await screen.findByPlaceholderText('Ej. llaveros'), {
      target: { value: 'imanes' },
    });
    const montos = screen.getAllByRole('spinbutton');
    fireEvent.change(montos[0], { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(mocks.post).toHaveBeenCalledWith('/sales', expect.objectContaining({ kind: 'COUNTER' }));
  });
});
