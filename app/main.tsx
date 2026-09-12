import React from 'react';
import { createRoot } from 'react-dom/client';
import Home from './page';
import { AuthProvider } from '../src/components/auth-provider';
import './globals.css';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <Home />
    </AuthProvider>
  </React.StrictMode>,
);
