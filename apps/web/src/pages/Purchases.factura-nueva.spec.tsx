import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/overlays';

/**
 * CARGAR UNA FACTURA: EL INSUMO Y LA RECARGA (2026-10-20).
 *
 * Las dos cosas salieron de una factura real de nueve líneas: ocho decían
 * `refill` o `con spool`, y una era una placa de impresión de $40.
 *
 * ⚠️ **La recarga en la línea no es una comodidad: es la ÚNICA oportunidad.**
 * El gasto nace al recibir y después no se puede corregir —ni desde Gastos
 * (`noSeTocaDesdeGastos`) ni desde Compras de filamento—, así que una línea que
 * no lo lleve condena a ese rollo a no poder marcarse nunca.
 *
 * ⚠️ Y es un test de CABLEADO: que el formulario DIBUJE los controles y que lo
 * elegido VIAJE en el cuerpo del POST. Las funciones puras y los tests del
 * servicio no ven ninguna de las dos cosas.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.del },
  apiErrorMessage: () => 'falló',
  downloadFile: vi.fn(),
  getToken: () => null,
}));

const { PurchasesPage } = await import('@/pages/Purchases');

const MATERIAL = { id: 'm1', name: 'PLA Basic Blanco' };
const INSUMO = { id: 'ins1', name: 'Placa lisa' };

function montar() {
  mocks.get.mockImplementation((url: string) => {
    if (url === '/purchase-invoices') return Promise.resolve({ data: [] });
    if (url === '/materials') return Promise.resolve({ data: [MATERIAL] });
    if (url === '/components') return Promise.resolve({ data: [INSUMO] });
    if (url === '/printers' || url === '/counterparties' || url === '/clients') {
      return Promise.resolve({ data: [] });
    }
    // El `Combobox` de marca/tipo/color pide la lista administrada.
    if (url.startsWith('/catalog-options')) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: null });
  });
  mocks.post.mockResolvedValue({ data: {} });

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <PurchasesPage />
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

/** Abre el diálogo de factura nueva. */
const abrir = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /Nueva factura|Cargar factura/i }));
  await screen.findByText('Qué pediste');
};

/**
 * El desplegable de la casa es un Radix (un `button`, no un `<select>`): Enter
 * para abrir y click en la opción, igual que en `Select.spec.tsx`.
 */
const elegir = (nombre: string | RegExp, opcion: string) => {
  fireEvent.keyDown(screen.getByRole('combobox', { name: nombre }), { key: 'Enter' });
  fireEvent.click(screen.getByText(opcion));
};

/**
 * El cuerpo del POST **de la factura**.
 *
 * ⚠️ No alcanza con `calls[0]`: el `Combobox` guarda cada opción nueva con su
 * propio `POST /catalog-options` apenas la creás —es optimista—, así que
 * escribir marca, tipo y color manda tres pedidos ANTES del de la factura.
 */
const cuerpo = () => {
  const llamada = mocks.post.mock.calls.find((c) => c[0] === '/purchase-invoices');
  if (!llamada) throw new Error('No se mandó la factura');
  return llamada[1] as { lines: Record<string, unknown>[] };
};

/** Espera a que se haya mandado la FACTURA (y no una opción del combobox). */
const seMandoLaFactura = () =>
  waitFor(() =>
    expect(mocks.post.mock.calls.some((c) => c[0] === '/purchase-invoices')).toBe(true),
  );

const guardar = () => fireEvent.click(screen.getByRole('button', { name: /^Guardar/ }));

/** El input de precio por unidad (no es `NumberInput`: vacío tiene que seguir vacío). */
const campoPrecio = () =>
  screen.getByRole('spinbutton', { name: 'Precio por unidad (USD)' }) as HTMLInputElement;

/**
 * Escribe un valor NUEVO en un `Combobox`: abrir, tipear y tocar «Crear».
 *
 * ⚠️ Cada uno se busca por su PLACEHOLDER, que es su nombre accesible. Con el
 * default los tres se llamarían "Elegir o escribir…" y ni el test ni un lector
 * de pantalla podrían distinguirlos.
 */
const escribirEnCombobox = (placeholder: string, valor: string) => {
  const mapa: Record<string, string> = {
    Tipo: 'Elegir o escribir el tipo…',
    'Marca (opcional)': 'Elegir o escribir la marca…',
    'Color (opcional)': 'Elegir o escribir el color…',
  };
  fireEvent.click(screen.getByRole('combobox', { name: mapa[placeholder] }));
  fireEvent.change(screen.getByPlaceholderText('Buscar o escribir…'), { target: { value: valor } });
  fireEvent.click(screen.getByText(new RegExp(`Crear.*${valor}`)));
};

describe('Nueva factura: recarga o con carrete por línea', () => {
  it('una línea de filamento ofrece el control', async () => {
    montar();
    await abrir();

    expect(screen.getByRole('combobox', { name: '¿Recarga o con carrete?' })).toBeTruthy();
  });

  it('lo elegido VIAJA en el cuerpo del POST', async () => {
    montar();
    await abrir();
    elegir('Filamento', 'PLA Basic Blanco');
    elegir('¿Recarga o con carrete?', 'Recarga (sin carrete)');
    guardar();

    await seMandoLaFactura();
    expect(cuerpo().lines[0].isRefill).toBe(true);
  });

  it('«con carrete» viaja como `false`, que es un dato y no la ausencia de uno', async () => {
    montar();
    await abrir();
    elegir('Filamento', 'PLA Basic Blanco');
    elegir('¿Recarga o con carrete?', 'Con carrete');
    guardar();

    await seMandoLaFactura();
    expect(cuerpo().lines[0].isRefill).toBe(false);
  });

  /**
   * ⚠️ El caso que protege la lección: **nada viene preseleccionado**. Elegir
   * por el dueño sería afirmar lo que el proveedor no dijo.
   */
  it('sin tocarlo viaja `null`: no hay default que afirme un carrete', async () => {
    montar();
    await abrir();

    const trigger = screen.getByRole('combobox', { name: '¿Recarga o con carrete?' });
    expect(trigger.textContent).toContain('No lo dice');

    elegir('Filamento', 'PLA Basic Blanco');
    guardar();
    await seMandoLaFactura();
    expect(cuerpo().lines[0].isRefill).toBeNull();
  });

  /**
   * Una impresora no tiene carrete. El control no se dibuja, y eso evita un
   * dato sin sentido guardado porque el formulario lo ofrecía.
   */
  it('una impresora NO ofrece el control', async () => {
    montar();
    await abrir();
    elegir('Qué es', 'Impresora del catálogo');

    expect(screen.queryByRole('combobox', { name: '¿Recarga o con carrete?' })).toBeNull();
  });
});

describe('Nueva factura: una línea puede ser un insumo', () => {
  it('el insumo del catálogo se puede pedir y viaja en su propio campo', async () => {
    montar();
    await abrir();
    elegir('Qué es', 'Insumo del catálogo');
    elegir('Insumo', 'Placa lisa');
    guardar();

    await seMandoLaFactura();
    const l = cuerpo().lines[0];
    expect(l.componentId).toBe('ins1');
    // ⚠️ Una línea es UNA sola cosa: si además viajara `materialId`, el
    // servidor tendría que elegir y el contrato la rechazaría.
    expect(l.materialId).toBeNull();
    expect(l.printerId).toBeNull();
  });

  it('un insumo que todavía no tenés se puede pedir por su nombre', async () => {
    montar();
    await abrir();
    elegir('Qué es', 'Algo que todavía no tenés');
    elegir('¿Filamento, impresora o insumo?', 'Un insumo (placa, boquilla, empaque)');
    expect(
      screen.getByRole('combobox', { name: '¿Filamento, impresora o insumo?' }).textContent,
    ).toContain('insumo');
    // Y el hint dice qué va a pasar al recibir, que es lo que no es obvio.
    expect(screen.getByText(/El insumo se crea cuando llegue/)).toBeTruthy();
  });
});

/**
 * LA FICHA NUEVA TRAE SU TIPO (2026-10-20).
 *
 * ⚠️ Hasta ese día una ficha nacida de una factura quedaba **muda** —solo
 * nombre y precio— y por eso **fuera del precio de cotización**:
 * `preciosPorTipo` hace `if (!type) continue`. La calculadora cotizaba sin
 * contar lo que costó ese rollo, sin avisar.
 */
describe('Nueva factura: la ficha de filamento nueva trae su tipo', () => {
  const pedirFilamentoNuevo = () => {
    elegir('Qué es', 'Algo que todavía no tenés');
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre' }), {
      target: { value: 'PLA Basic Bambu Lab Magenta' },
    });
  };

  it('pide marca, tipo y color cuando es un filamento nuevo', async () => {
    montar();
    await abrir();
    pedirFilamentoNuevo();

    expect(screen.getByText('Tipo')).toBeTruthy();
    expect(screen.getByText('Marca (opcional)')).toBeTruthy();
    expect(screen.getByText('Color (opcional)')).toBeTruthy();
  });

  /**
   * ⚠️ El botón se apaga ANTES de que el servidor rechace. Un 400 después de
   * llenar nueve líneas es la peor forma de enterarse de una regla.
   */
  it('sin tipo NO deja guardar', async () => {
    montar();
    await abrir();
    pedirFilamentoNuevo();
    fireEvent.change(campoPrecio(), { target: { value: '20' } });

    expect(screen.getByRole('button', { name: /^Guardar/ })).toBeDisabled();
  });

  it('con el tipo puesto sí deja, y los tres viajan en el cuerpo', async () => {
    montar();
    await abrir();
    pedirFilamentoNuevo();
    fireEvent.change(campoPrecio(), { target: { value: '20' } });
    escribirEnCombobox('Tipo', 'PLA Basic');
    escribirEnCombobox('Marca (opcional)', 'Bambu Lab');
    escribirEnCombobox('Color (opcional)', 'Magenta');
    guardar();

    await seMandoLaFactura();
    const l = cuerpo().lines[0];
    expect(l.nuevoTipoFilamento).toBe('PLA Basic');
    expect(l.nuevaMarca).toBe('Bambu Lab');
    expect(l.nuevoColor).toBe('Magenta');
  });

  /**
   * ⚠️ El contrato PROHÍBE estos campos en una línea del catálogo: ahí
   * contradecirían a la ficha que ya existe y nadie sabría cuál manda.
   */
  it('una línea del catálogo NO los pide ni los manda', async () => {
    montar();
    await abrir();
    elegir('Filamento', 'PLA Basic Blanco');

    expect(screen.queryByText('Tipo')).toBeNull();

    guardar();
    await seMandoLaFactura();
    expect(cuerpo().lines[0].nuevoTipoFilamento).toBeUndefined();
  });

  it('una impresora nueva tampoco los pide: no tiene tipo de filamento', async () => {
    montar();
    await abrir();
    elegir('Qué es', 'Algo que todavía no tenés');
    elegir('¿Filamento, impresora o insumo?', 'Una impresora');

    expect(screen.queryByText('Tipo')).toBeNull();
  });
});
