import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
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
