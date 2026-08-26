import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173
  },
  build: {
    sourcemap: false, // === SECURITY: Prevent source code leakage ===
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // === SECURITY: Prevent data leakage in production console ===
        drop_debugger: true,
      },
    },
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom', 'zustand'],
          three: ['three', '@react-three/fiber'],
          ui: ['framer-motion', 'lucide-react']
        }
      }
    }
  }
});
