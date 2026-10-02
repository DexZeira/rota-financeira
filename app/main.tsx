import React from 'react';
import { createRoot } from 'react-dom/client';
import Home from './page';
import { RecoveryMode } from '../src/components/recovery-mode';
import { OfflineStatus } from '../src/components/offline-status';
import { AuthProvider } from '../src/components/auth-provider';
import './globals.css';
import { installDiagnostics } from '../src/services/app-diagnostics';
import { PageBoundary } from '../src/components/page-boundary';
import { ValuePrivacy } from '../src/components/value-privacy';
installDiagnostics();
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PageBoundary>
    <AuthProvider>
      <ValuePrivacy>{window.location.hash === '#recovery' ? <RecoveryMode /> : <Home />}</ValuePrivacy>
      <OfflineStatus />
    </AuthProvider>
    </PageBoundary>
  </React.StrictMode>,
);
