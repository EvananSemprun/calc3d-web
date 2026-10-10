import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Runner de tests de `apps/web`.
 *
 * Va APARTE de `vite.config.ts` a propósito: ese archivo lleva el proxy del dev
 * server, que no hace falta para los tests. Lo único que se comparte es el alias
 * `@`, que tiene que decir lo mismo en los dos (si divergen, un import que anda
 * en el navegador falla en el test, o al revés). El plugin de React tampoco se
 * usa: `tsconfig.json` declara `jsx: "react-jsx"` y el esbuild de Vite ya
 * transforma el JSX con eso; el plugin solo agrega fast-refresh, que en un test
 * no significa nada.
 *
 * ⚠️ **DOS entornos, elegidos por la EXTENSIÓN del archivo** (2026-10-10):
 *
 * | Archivo      | Entorno | Para qué |
 * |--------------|---------|----------|
 * | `*.spec.ts`  | `node`  | funciones puras (derivaciones, filtros, totales) |
 * | `*.spec.tsx` | `jsdom` | componentes renderizados (testing-library) |
 *
 * El patrón es la extensión y no una lista de rutas porque una lista hay que
 * acordarse de actualizarla: un spec de componente nuevo que no estuviera en
 * ella correría en `node`, fallaría con "document is not defined" y la
 * tentación sería mandar TODO a jsdom. Un spec de función pura en jsdom no está
 * mal, pero levanta un DOM entero por archivo para no usarlo, y los 50 tests
 * puros que ya existen son justamente los que conviene que sigan siendo
 * instantáneos.
 *
 * Correr un proyecto solo: `pnpm test -- --project node` (o `dom`).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    projects: [
      {
        // `extends: true` hereda el alias `@` de arriba en vez de repetirlo:
        // declarado dos veces, el día que cambie se cambia uno y el otro
        // proyecto queda resolviendo a otra carpeta.
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.spec.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.spec.tsx'],
          setupFiles: ['./src/test/setup-dom.ts'],
        },
      },
    ],
  },
});
