import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initTelegramWebApp } from '@/shared/lib/telegram';

// Инициализируем Telegram WebApp API (ready, expand, цвета шапки и фона) до сборки интерфейса
initTelegramWebApp();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
