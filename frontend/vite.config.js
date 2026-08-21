import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // El puerto sale de PORT cuando el entorno lo fija (herramientas que levantan
  // el dev server con un puerto asignado). Sin PORT, el 5173 de siempre.
  server: { port: Number(process.env.PORT) || 5173 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    coverage: {
      // La catedra exige 60% sobre todo el modulo (dimension 6).
      thresholds: { lines: 60, functions: 60, branches: 60, statements: 60 },
      include: ['src/**/*.{js,jsx}'],
      // `mocks/` es andamiaje con fecha de vencimiento: datos falsos y un
      // servidor en memoria para disenar las pantallas sin backend. Se borra
      // cuando esten conectadas, asi que exigirle cobertura seria pagar tests
      // por codigo que no va a llegar a produccion.
      exclude: ['src/main.jsx', 'src/test/**', 'src/mocks/**'],
    },
  },
});
