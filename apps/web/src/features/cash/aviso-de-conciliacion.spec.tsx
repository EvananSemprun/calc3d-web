import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '@/components/overlays';
import { errorCualquiera, errorDeConciliacion } from './aviso-de-conciliacion.ayuda';

/**
 * EL AVISO DE CONCILIACIÓN — la pieza única, probada una vez.
 *
 * ⚠️ Las siete puertas llaman a ESTE hook, así que lo que se mide acá vale para
 * todas: lo que cada spec de pantalla prueba es su propio cableado (que el flag
 * llegue al cuerpo o a la query correctos), no esta lógica otra vez.
 *
 * ⚠️ Incluye el camino de BORRADO (`useBorrarConAvisoDeConciliacion`), que no
 * tiene diálogo donde poner la píldora y contesta con una segunda confirmación.
 * Sin él esas puertas serían el mismo callejón con otro disfraz.
 */

const notificado = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock('@/components/toast', () => ({ notify: notificado, Toaster: () => null }));
vi.mock('@/lib/api', () => ({ api: {}, apiErrorMessage: () => 'falló' }));

const { AvisoDeConciliacion, useAvisoDeConciliacion, useBorrarConAvisoDeConciliacion } =
  await import('./aviso-de-conciliacion');

/** Una puerta de mentira, con lo mínimo que tiene cualquiera de las siete. */
function PuertaDePrueba({
  enviar,
  alGuardar,
}: {
  enviar: (c: boolean) => Promise<unknown>;
  alGuardar?: () => void;
}) {
  const conciliacion = useAvisoDeConciliacion();
  return (
    <div>
      <button type="button" onClick={() => conciliacion.intentar({ enviar, alGuardar })}>
        Guardar
      </button>
      <AvisoDeConciliacion
        aviso={conciliacion.aviso}
        confirmando={conciliacion.confirmando}
        onConfirmar={conciliacion.confirmar}
      />
    </div>
  );
}

/**
 * ⚠️ El `ConfirmProvider` va POR FUERA: el hook lee el contexto, así que
 * montarlo adentro del componente le deja el valor por defecto (que resuelve
 * `false`) y la segunda confirmación nunca aparece.
 */
function Borrador({
  enviar,
  alGuardar,
}: {
  enviar: (c: boolean) => Promise<unknown>;
  alGuardar?: () => void;
}) {
  const borrar = useBorrarConAvisoDeConciliacion();
  return (
    <button type="button" onClick={() => borrar({ enviar, alGuardar })}>
      Eliminar
    </button>
  );
}

function PuertaDeBorrado(props: {
  enviar: (c: boolean) => Promise<unknown>;
  alGuardar?: () => void;
}) {
  return (
    <ConfirmProvider>
      <Borrador {...props} />
    </ConfirmProvider>
  );
}

beforeEach(() => {
  notificado.error.mockReset();
  notificado.success.mockReset();
});

describe('useAvisoDeConciliacion', () => {
  it('guardar bien no dibuja nada', async () => {
    const alGuardar = vi.fn();
    render(<PuertaDePrueba enviar={async () => ({})} alGuardar={alGuardar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await vi.waitFor(() => expect(alGuardar).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('el 400 del candado dibuja la píldora con el texto del SERVIDOR', async () => {
    render(
      <PuertaDePrueba
        enviar={async () => {
          throw errorDeConciliacion([
            { id: 'r1', date: '2026-11-16', status: 'CONFIRMED' },
            { id: 'r2', date: '2026-11-10', status: 'DRAFT' },
          ]);
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    const alerta = await screen.findByRole('alert');
    // Nombra las DOS y distingue confirmada de borrador: eso lo escribe
    // `mensajeDeConciliacionAfectada` en shared, no el panel.
    expect(alerta).toHaveTextContent('2026-11-16 (confirmada)');
    expect(alerta).toHaveTextContent('2026-11-10 (borrador)');
    expect(notificado.error).not.toHaveBeenCalled();
  });

  it('«Guardar igual» reenvía con true y limpia el aviso al guardar', async () => {
    const enviados: boolean[] = [];
    const alGuardar = vi.fn();
    render(
      <PuertaDePrueba
        alGuardar={alGuardar}
        enviar={async (c) => {
          enviados.push(c);
          if (!c) throw errorDeConciliacion();
          return {};
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar igual' }));

    await vi.waitFor(() => expect(alGuardar).toHaveBeenCalled());
    expect(enviados).toEqual([false, true]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un error cualquiera sigue saliendo por toast y NO dibuja el botón', async () => {
    render(
      <PuertaDePrueba
        enviar={async () => {
          throw errorCualquiera();
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await vi.waitFor(() => expect(notificado.error).toHaveBeenCalledWith('falló'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('si el reenvío falla por otra cosa, avisa y no deja el aviso colgado', async () => {
    render(
      <PuertaDePrueba
        enviar={async (c) => {
          throw c ? errorCualquiera() : errorDeConciliacion();
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar igual' }));

    await vi.waitFor(() => expect(notificado.error).toHaveBeenCalled());
  });
});

describe('useBorrarConAvisoDeConciliacion', () => {
  it('el 400 abre una SEGUNDA confirmación y «Eliminar igual» reenvía con true', async () => {
    const enviados: boolean[] = [];
    const alGuardar = vi.fn();
    render(
      <PuertaDeBorrado
        alGuardar={alGuardar}
        enviar={async (c) => {
          enviados.push(c);
          if (!c) throw errorDeConciliacion();
          return {};
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    // El texto del servidor, en la confirmación.
    expect(await screen.findByText(/fecha igual o anterior/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar igual' }));

    await vi.waitFor(() => expect(alGuardar).toHaveBeenCalled());
    expect(enviados).toEqual([false, true]);
    expect(notificado.error).not.toHaveBeenCalled();
  });

  it('«Dejarlo así» no borra nada y no muestra ningún error', async () => {
    const enviados: boolean[] = [];
    render(
      <PuertaDeBorrado
        enviar={async (c) => {
          enviados.push(c);
          throw errorDeConciliacion();
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Dejarlo así' }));

    await vi.waitFor(() => expect(enviados).toEqual([false]));
    // ⚠️ Decir que no es una decisión, no un fallo: un toast de error acá
    // diría que algo salió mal cuando no pasó nada.
    expect(notificado.error).not.toHaveBeenCalled();
  });
});
