import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './theme/ThemeContext';
import {
  StaffAuthProvider,
  AdminRoute,
  DriverRoute,
  AdminSignIn,
  DriverSignIn,
} from './auth/StaffAuth';
import Admin from './pages/Admin';
import Rider from './pages/Rider';
import './styles.css';
import './responsive.css';
import './light-mode-fixes.css';
import './interaction-fixes.css';

/*
 * STAFF CONSOLE ENTRY (Phase A).
 *
 * Built ONLY when BUILD_TARGET=console (`npm run build:console`) and deployed
 * to its own Vercel project on a private origin protected by Vercel Deployment
 * Protection. The public storefront (src/main.jsx) does not contain any of
 * these routes or imports.
 *
 * Auth model is unchanged: admin actions are gated by the server-side session
 * cookie checked on every request by /api/admin/*; drivers use Supabase Auth
 * with the allow-list. This router just renders those pages.
 */
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <StaffAuthProvider>
        <HashRouter>
          <Routes>
            <Route index element={<Navigate to="/admin" replace />} />
            <Route path="admin/sign-in" element={<AdminSignIn />} />
            <Route path="admin" element={<AdminRoute><Admin /></AdminRoute>} />
            <Route path="owner-sign-in" element={<AdminSignIn />} />
            <Route path="driver/sign-in" element={<DriverSignIn />} />
            <Route path="driver" element={<DriverRoute><Rider /></DriverRoute>} />
            <Route path="rider" element={<DriverRoute><Rider /></DriverRoute>} />
            <Route path="rider/sign-in" element={<DriverSignIn />} />
            <Route path="*" element={<Navigate to="/admin/sign-in" replace />} />
          </Routes>
        </HashRouter>
      </StaffAuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);
