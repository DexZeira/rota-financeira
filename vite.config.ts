import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig(({ mode }) => ({
  // Browser fixtures never load production environment files or credentials.
  ...(mode === 'e2e' ? { envDir: false as const, define: {
    'import.meta.env.VITE_OPEN_FINANCE_MODE': JSON.stringify('mock'),
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://rota-test.supabase.co'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('sb_publishable_deterministic_fixture'),
  } } : {}),
  plugins: [react()],
  css: { postcss: { plugins: [tailwindcss()] } },
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  server: { host: '127.0.0.1' },
  build: {
    outDir: mode === 'e2e' ? '.test-output/e2e-dist' : 'dist',
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('recharts') || id.includes('/d3-')) return 'charts';
          if (id.includes('lucide-react')) return 'icons';
          if (
            id.includes('/react/') ||
            id.includes('react-dom') ||
            id.includes('scheduler')
          )
            return 'react-vendor';
          return 'vendor';
        },
      },
    },
  },
}));
