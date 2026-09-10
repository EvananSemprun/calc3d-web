import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // UN solo puerto para el panel. Es el 5180 y no otro porque es el que la
    // API acepta por CORS (`WEB_ORIGIN`): levantarlo en 5173 hacía que el
    // navegador bloqueara el login sin decir por qué.
    port: 5180,
    // Si el puerto está ocupado, fallar en vez de saltar a otro: un panel en
    // 5181 se ve igual y no puede hablar con la API.
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
