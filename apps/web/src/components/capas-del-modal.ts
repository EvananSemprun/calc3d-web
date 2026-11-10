import * as React from 'react';

/**
 * EL ESCAPE CIERRA EL DESPLEGABLE, NO EL MODAL.
 *
 * ⚠️ **Por qué esto no se arregla con `stopPropagation()`.** Quien escucha el
 * Escape de un `Dialog` es el `DismissableLayer` interno de Radix, y lo hace
 * en `document` y en fase de **captura**. React engancha sus `onKeyDown` en el
 * contenedor raíz y en fase de **burbuja**, o sea DESPUÉS. Cuando el
 * desplegable se entera de la tecla, el modal ya decidió cerrarse: frenar la
 * propagación no cancela un listener que ya corrió. Hubo una mitigación así
 * durante meses, con su comentario nombrando este mismo bug, y nunca sirvió.
 *
 * Lo único que Radix mira antes de cerrarse es `event.defaultPrevented`
 * **después** de llamar a `onEscapeKeyDown`. Este módulo es el puente: cada
 * desplegable con lista propia se anota mientras está abierto, y el `Dialog`
 * consulta el registro desde ese callback para llamar a `preventDefault()`.
 *
 * Vive en su propio archivo y no en `overlays.tsx` porque lo usan los dos
 * lados: `overlays.tsx` (el `Dialog`) ya importa de `ui.tsx`, así que ponerlo
 * ahí dejaría a `ui.tsx` importando de `overlays.tsx` — un ciclo.
 */
export type RegistroDeCapas = {
  /** Anota una capa abierta con su forma de cerrarse; devuelve cómo desanotarla. */
  anotar: (cerrar: () => void) => () => void;
  /** La última capa que se abrió, o `null` si no hay ninguna. */
  ultima: () => (() => void) | null;
};

export const CapasDelModal = React.createContext<RegistroDeCapas | null>(null);

/**
 * El registro que monta el `Dialog`: una pila LIFO guardada en un ref, así
 * anotar o desanotar no redibuja el modal.
 *
 * ⚠️ Es una PILA y no un booleano a propósito. Con dos desplegables abiertos,
 * un booleano se apagaría al cerrar el primero y el Escape que cierra el
 * segundo volvería a llevarse el formulario.
 */
export function useRegistroDeCapas(): RegistroDeCapas {
  const pila = React.useRef<Array<() => void>>([]);
  return React.useMemo(
    () => ({
      anotar: (cerrar) => {
        // Una envoltura propia por capa: es la identidad con la que se saca de
        // la pila, y dos desplegables podrían pasar la misma función.
        const entrada = () => cerrar();
        pila.current.push(entrada);
        return () => {
          pila.current = pila.current.filter((c) => c !== entrada);
        };
      },
      ultima: () => pila.current[pila.current.length - 1] ?? null,
    }),
    [],
  );
}

/**
 * Lo llama cada desplegable con lista propia (`SelectBuscable`, `Combobox`).
 *
 * Fuera de un modal no hay registro y no hace nada: en una página el Escape ya
 * lo cierra el propio desplegable y no hay nada detrás que proteger.
 */
export function useCapaDescartable(abierto: boolean, cerrar: () => void) {
  const registro = React.useContext(CapasDelModal);
  // El cierre se guarda en un ref: así la pila no tiene que volver a anotarse
  // en cada render para no quedarse con una versión vieja de la función.
  const ultimoCerrar = React.useRef(cerrar);
  ultimoCerrar.current = cerrar;
  React.useEffect(() => {
    if (!abierto || !registro) return;
    return registro.anotar(() => ultimoCerrar.current());
  }, [abierto, registro]);
}
