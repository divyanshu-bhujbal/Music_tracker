import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'src/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            sourcemap: true,
          },
        },
      },
      {
        entry: 'src/preload.ts',
        onstart(args) {
          args.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            sourcemap: true,
          },
        },
      },
    ]),
  ],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
