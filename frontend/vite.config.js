import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/pruebas/setup.js',
    coverage: {
      // La catedra exige 60% sobre todo el modulo (dimension 6).
      thresholds: { lines: 60, functions: 60, branches: 60, statements: 60 },
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/main.jsx', 'src/pruebas/**'],
    },
  },
});
