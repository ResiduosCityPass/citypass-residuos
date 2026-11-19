import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { buildVersion } from './build-version.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const target = new URL(env.VITE_API_URL || env.VITE_API_ORIGIN || 'http://localhost:3000');
  const prefix = env.VITE_API_URL ? target.pathname.replace(/\/$/, '')
    : `/${env.VITE_API_PREFIX || 'api/v1'}`;
  return {
  plugins: [react(), buildVersion()],
  // El puerto sale de PORT cuando el entorno lo fija (herramientas que levantan
  // el dev server con un puerto asignado). Sin PORT, el 5173 de siempre.
  server: { port: Number(process.env.PORT) || 5173, proxy: {
    [`${prefix}/metricas`]: { target: target.origin, changeOrigin: true },
  } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    coverage: {
      reporter: ['text', 'json', 'html', 'lcov'],
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
  };
});
