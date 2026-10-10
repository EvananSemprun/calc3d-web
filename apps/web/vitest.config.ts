import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Runner de tests de `apps/web`.
 *
 * Va APARTE de `vite.config.ts` a propósito: ese archivo lleva el plugin de
 * React y el proxy del dev server, que no hacen falta para probar funciones
 * puras y solo suman arranque. Lo único que se comparte es el alias `@`, que
 * tiene que decir lo mismo en los dos (si divergen, un import que anda en el
 * navegador falla en el test, o al revés).
 *
 * ⚠️ **Entorno `node`, no jsdom.** No hay jsdom ni testing-library instalados y
 * no se agregaron dependencias para esto: acá se prueban funciones puras
 * (derivaciones, filtros, totales). Un test de componente necesita esas dos
 * dependencias y hay que pedirlas antes.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
