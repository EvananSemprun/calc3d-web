import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Lo que necesita un test de componente, y NADA más.
 *
 * Solo lo carga el proyecto `dom` de `vitest.config.ts` (los `*.spec.tsx`): los
 * specs de funciones puras siguen arrancando sin esto.
 */

// El auto-cleanup de testing-library se registra solo cuando `afterEach` es
// global, y acá `globals` está apagado (cada spec importa lo que usa). Sin esto,
// cada `render` deja su árbol montado en el mismo `document` y un
// `getAllBy...` del segundo test cuenta también las filas del primero: el test
// que importa pasaría por los motivos equivocados.
afterEach(cleanup);

/**
 * CUÁNTO ESPERA UN `findBy*` / `waitFor` ANTES DE DARSE POR VENCIDO.
 *
 * ⚠️ **Esto es lo que tenía INESTABLE a la suite** (2026-10-19). Dos o tres
 * tests de pantalla fallaban al azar —no siempre los mismos— con la suite
 * completa, y pasaban 3 de 3 corridos solos. Una suite inestable es peor que
 * una roja: una roja se arregla, una inestable enseña a volver a correrla hasta
 * que pase, y el día que el rojo sea de verdad nadie le va a creer.
 *
 * ⚠️ **El tope que se agotaba NO era el de vitest, era ESTE.** `testTimeout`
 * de vitest valía 5 s y los tests caían a los **2,8 s**: el que se vencía era
 * el de testing-library, que trae **1 s** por defecto. Subir `testTimeout` —el
 * primer arreglo que se intentó— no cambió absolutamente nada, y el error lo
 * decía desde el principio: no era "se agotó el tiempo del test", era
 * *"Unable to find an element with the display value: Llavero"*, o sea que la
 * página había dibujado el cascarón y los datos todavía no habían llegado.
 * Cuando un arreglo "obvio" no mueve la aguja, el problema es el diagnóstico.
 *
 * Con todos los archivos en paralelo, una consulta de React Query mockeada
 * puede tardar más de 1 s en resolver y pintar. 5 s da aire sin esconder nada:
 * lo que de verdad no llega nunca sigue fallando, solo que recién a los 5.
 *
 * ⚠️ Esto NO reemplaza a la "puerta" de `Dashboard.avisos.spec.tsx`. Aquel
 * patrón resuelve otra cosa: que una AUSENCIA signifique algo. Sin él,
 * `queryByText(...)` corrido antes de que llegue la respuesta no encuentra el
 * aviso porque todavía no hay datos, no porque la regla lo apague — y el test
 * pasa sin probar nada. Un test que afirma que algo NO está necesita la
 * puerta; este tope solo evita que uno que espera algo se rinda temprano.
 */
configure({ asyncUtilTimeout: 5_000 });

/**
 * `matchMedia` no existe en jsdom y la capa de motion lo consulta
 * (`useReducedMotion`). Sin el doble, cualquier componente que la use revienta
 * al montar con "matchMedia is not a function".
 *
 * Responde SIEMPRE `matches: false` ("sin preferencia declarada"), que es el
 * caso que dibuja la UI completa. Un test que necesite el camino de
 * `prefers-reduced-motion` tiene que pisar esto a propósito, no heredarlo.
 */
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

/** Tampoco existe en jsdom, y lo usan los popups de Radix al abrirse. */
if (typeof globalThis.ResizeObserver !== 'function') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
