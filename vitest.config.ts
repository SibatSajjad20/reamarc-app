import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: [
      'src/utils/fileUrl.test.ts',
      'src/utils/__tests__/**/*.test.ts',
      'src/components/ui/__tests__/**/*.test.tsx',
      'src/hooks/__tests__/**/*.test.ts',
      'src/hooks/__tests__/**/*.test.tsx',
      'src/components/clients/__tests__/**/*.test.tsx',
      'src/services/__tests__/**/*.test.ts',
      'src/components/content-calendar/__tests__/**/*.test.tsx',
    ],
  },
});
