import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';

// https://vitejs.dev/config/
export default defineConfig({
  // Указываем базовый путь для корректного поиска ассетов на GitHub Pages
  base: '/vvd-cpa/',
  plugins: [react()],
  resolve: {
    alias: {
      // Настройка алиаса @ для указания на папку src
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3000,
    // Включаем host, чтобы сервер был доступен в локальной сети для мобильного тестирования
    host: true,
  },
});
