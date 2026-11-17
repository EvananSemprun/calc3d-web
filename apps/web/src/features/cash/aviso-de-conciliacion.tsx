import { useCallback, useRef, useState } from 'react';
import { leerAvisoDeConciliacion, type CuerpoDeAvisoDeConciliacion } from '@calc3d/shared';
import { apiErrorMessage } from '@/lib/api';
import { notify } from '@/components/toast';
import { Button } from '@/components/ui';
import { useConfirm } from '@/components/overlays';

/**
 * EL AVISO DE CONCILIACIÓN EN EL PANEL — la salida del callejón (2026-11-17).
 *
 * El servidor corta con 400 cuando cargas un movimiento con fecha igual o
 * anterior a una conciliación de caja (`conciliacion-guard.ts`): es un candado
 * **BLANDO**, no impide nada, obliga a decirlo. El cliente reintenta con
 * `confirmoConciliacion: true`.
 *
 * ⚠️ **El panel NO implementaba la otra mitad, y eso volvía el aviso un
 * CALLEJÓN SIN SALIDA.** Medido el 2026-11-17: `confirmoConciliacion` aparecía
 * en **0 archivos** de `apps/web/src`. Las siete puertas hacían
 * `catch { notify.error(apiErrorMessage(e)) }`, así que salía un toast que
 * decía «vuelve a intentarlo confirmando» y **no había con qué confirmar**:
 * reintentar daba el mismo toast y el abono nunca se guardaba. Caso real del
 * dueño: abono del encargo #56, $11, del 16/11, con una conciliación confirmada
 * de ese mismo día.
 *
 * ⚠️ **Una definición, siete puertas.** Este archivo es la única que existe. Es
 * la regla de este repo y ya se pagó caro romperla: la misma regla escrita en
 * dos lados termina diciendo dos cosas. Si aparece una octava puerta —otro DTO
 * que mueva el saldo—, se cablea acá, no se copia el JSX.
 *
 * ⚠️ **El texto es del servidor.** `message` viaja en el 400 y lo escribe
 * `mensajeDeConciliacionAfectada` en `shared`. El panel no lo reescribe ni lo
 * resume: es el único que sabe qué conciliaciones y en qué estado.
 *
 * ⚠️ **Ámbar y en PÍLDORA, no texto suelto** (ver «Rojo vs ámbar en los avisos»
 * en el CLAUDE.md del panel). Cargar con fecha vieja es un hecho LEGÍTIMO que
 * se puede guardar, así que no va en rojo; y el ámbar y el oro de marca miden
 * 1.04:1 entre ellos —indistinguibles—, así que el borde y el fondo lo separan
 * por FORMA. Varias de estas puertas tienen cifras en oro al lado.
 */

/** Lo que hay que reintentar, guardado para que «Guardar igual» pueda repetirlo. */
export interface IntentoDeGuardar {
  /**
   * Manda la operación. Recibe el flag y decide **dónde** lo pone: en el cuerpo
   * para crear o editar, en la query (`?confirmoConciliacion=true`) para borrar
   * o anular. El hook no lo sabe ni tiene por qué.
   */
  enviar: (confirmoConciliacion: boolean) => Promise<unknown>;
  /** Guardó: cerrar el diálogo, refrescar, lo que haga cada puerta. */
  alGuardar?: () => void;
  /** No guardó (por el aviso o por otro error): típicamente `setSaving(false)`. */
  alFallar?: (error: unknown) => void;
  /**
   * El texto del toast para los errores que NO son este aviso. Solo hace falta
   * donde la puerta ya tenía uno propio (Gastos distingue un `Error` local del
   * 400 del servidor); por defecto, `apiErrorMessage`.
   */
  mensajeDeError?: (error: unknown) => string;
}

export interface EstadoDelAviso {
  /** El 400 del candado, o `null` si no hay aviso que mostrar. */
  aviso: CuerpoDeAvisoDeConciliacion | null;
  /** «Guardar igual» en vuelo. */
  confirmando: boolean;
  /** Primer intento, sin confirmar. */
  intentar: (intento: IntentoDeGuardar) => Promise<boolean>;
  /** Reenvía lo mismo CON la confirmación. */
  confirmar: () => Promise<boolean>;
  /** Cierra el aviso sin guardar (al editar la fecha, por ejemplo). */
  descartar: () => void;
}

/**
 * El cuerpo del error.
 *
 * ⚠️ **No usa `axios.isAxiosError` a propósito.** Mira `response.data` por
 * forma y, si no lo hay, el error pelado. Así vale para axios, para lo que
 * envuelve react-query y para un test que arma el 400 a mano, sin que el hook
 * dependa del cliente HTTP. Quien decide si ES el aviso es
 * `leerAvisoDeConciliacion`, que valida la forma de verdad.
 */
function cuerpoDelError(error: unknown): unknown {
  if (typeof error === 'object' && error !== null) {
    const { response } = error as { response?: { data?: unknown } };
    if (response && typeof response === 'object' && 'data' in response) return response.data;
  }
  return error;
}

export function useAvisoDeConciliacion(): EstadoDelAviso {
  const [aviso, setAviso] = useState<CuerpoDeAvisoDeConciliacion | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  // En un ref y no en estado: reintentar no tiene que redibujar nada, y guardarlo
  // en estado haría que `confirmar` leyera el intento viejo del render anterior.
  const ultimoIntento = useRef<IntentoDeGuardar | null>(null);

  const correr = useCallback(async (intento: IntentoDeGuardar, confirmo: boolean) => {
    try {
      await intento.enviar(confirmo);
      setAviso(null);
      ultimoIntento.current = null;
      intento.alGuardar?.();
      return true;
    } catch (error) {
      const esteAviso = leerAvisoDeConciliacion(cuerpoDelError(error));
      if (esteAviso) {
        // ⚠️ SIN toast: el aviso va en el diálogo, donde está el botón. Un toast
        // se va solo y deja al dueño sin la salida — es el bug que esto arregla.
        setAviso(esteAviso);
        ultimoIntento.current = intento;
      } else {
        notify.error((intento.mensajeDeError ?? apiErrorMessage)(error));
      }
      intento.alFallar?.(error);
      return false;
    }
  }, []);

  const intentar = useCallback(
    (intento: IntentoDeGuardar) => {
      setAviso(null);
      return correr(intento, false);
    },
    [correr],
  );

  const confirmar = useCallback(async () => {
    const intento = ultimoIntento.current;
    if (!intento || confirmando) return false;
    setConfirmando(true);
    try {
      return await correr(intento, true);
    } finally {
      setConfirmando(false);
    }
  }, [correr, confirmando]);

  const descartar = useCallback(() => {
    setAviso(null);
    ultimoIntento.current = null;
  }, []);

  return { aviso, confirmando, intentar, confirmar, descartar };
}

/**
 * LA PÍLDORA con el aviso y la salida. Se dibuja dentro del mismo diálogo,
 * arriba de los botones, y no reemplaza nada: el formulario sigue editable
 * (cambiar la fecha a una posterior es la otra salida legítima).
 */
export function AvisoDeConciliacion({
  aviso,
  confirmando,
  onConfirmar,
  etiqueta = 'Guardar igual',
}: {
  aviso: CuerpoDeAvisoDeConciliacion | null;
  confirmando: boolean;
  onConfirmar: () => void;
  /** «Guardar igual» no sirve para borrar: ahí es «Eliminar igual». */
  etiqueta?: string;
}) {
  if (!aviso) return null;
  return (
    <div
      // `alert` y no `status`: aparece por una acción del dueño y tiene que
      // leerse antes de que toque el botón.
      role="alert"
      className="space-y-2 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-sm text-warning"
    >
      {/* El texto del servidor, tal cual. */}
      <p>{aviso.message}</p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={confirmando}
        onClick={onConfirmar}
        className="border-warning/60 text-warning hover:bg-warning/20 hover:text-warning"
      >
        {confirmando ? 'Guardando…' : etiqueta}
      </Button>
    </div>
  );
}

/**
 * EL MISMO CANDADO EN UN BORRADO O UNA ANULACIÓN (2026-11-17).
 *
 * Borrar un movimiento con fecha vieja deja mintiendo a la conciliación igual
 * que cargarlo, y el servidor lo corta con el mismo 400. Pero acá no hay
 * diálogo con un formulario donde poner la píldora: la acción sale de un
 * `confirm()` que ya se cerró.
 *
 * ⚠️ Por eso la salida es una **segunda confirmación** con el texto del
 * servidor, no un toast. Sin ella estas puertas son el mismo callejón sin
 * salida que el del abono: el aviso dice «vuelve a intentarlo confirmando» y no
 * hay nada que tocar.
 *
 * ⚠️ `tone` queda en `default`, NO en `destructive`. Lo destructivo ya se
 * confirmó en el paso anterior; este paso solo dice que una conciliación
 * quedará desactualizada, que es un hecho legítimo —el mismo criterio que pone
 * la píldora en ámbar y no en rojo—.
 */
export function useBorrarConAvisoDeConciliacion() {
  const confirm = useConfirm();
  return useCallback(
    async (intento: {
      enviar: (confirmoConciliacion: boolean) => Promise<unknown>;
      /** «Eliminar igual», «Anular igual»… lo que haga esta puerta. */
      etiqueta?: string;
      alGuardar?: () => void;
      mensajeDeError?: (error: unknown) => string;
    }): Promise<boolean> => {
      const correr = async (confirmo: boolean): Promise<boolean> => {
        try {
          await intento.enviar(confirmo);
          intento.alGuardar?.();
          return true;
        } catch (error) {
          const aviso = confirmo ? null : leerAvisoDeConciliacion(cuerpoDelError(error));
          if (!aviso) {
            notify.error((intento.mensajeDeError ?? apiErrorMessage)(error));
            return false;
          }
          const sigue = await confirm({
            title: 'Una conciliación de caja quedará desactualizada',
            description: aviso.message,
            confirmLabel: intento.etiqueta ?? 'Eliminar igual',
            cancelLabel: 'Dejarlo así',
          });
          // Dijo que no: no se borró nada y no hay error que mostrar.
          return sigue ? await correr(true) : false;
        }
      };
      return correr(false);
    },
    [confirm],
  );
}
