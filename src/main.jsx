import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { StoreProvider } from './store';
import { Layout } from './components';
import { ThemeProvider } from './theme/ThemeContext';
import {
  StaffAuthProvider,
  AdminRoute,
  DriverRoute,
  AdminSignIn,
  DriverSignIn,
} from './auth/StaffAuth';
import Home from './pages/Home';
import './styles.css';
import './responsive.css';
import './light-mode-fixes.css';
import './interaction-fixes.css';
import './skeletons.css';
import './spatial.css';
import './admin-tables.css';

// Route-level code splitting: every page except Home loads on first visit,
// so the storefront's first paint only ships Home.
const Shop = lazy(() => import('./pages/Shop'));
const Product = lazy(() => import('./pages/Product'));
const Cart = lazy(() => import('./pages/Cart'));
const Checkout = lazy(() => import('./pages/Checkout'));
const Services = lazy(() => import('./pages/Services'));
const Account = lazy(() => import('./pages/Account'));
const OrderDetail = lazy(() => import('./pages/OrderDetail'));
const Help = lazy(() => import('./pages/Help'));
const Admin = lazy(() => import('./pages/Admin'));
const Rider = lazy(() => import('./pages/Rider'));

const PageFallback = () => (
  column" wrap page" role="status" aria-label="Loading page">
    <div className="placeholder-box">Loading…</div>
  </div>
);

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <StaffAuthProvider>
        <StoreProvider>
          <HashRouter>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                {/* Customer storefront — wrapped in Layout (header, footer, bottom nav). */}
                <Route element={<Layout />}>
                  <Route index element={<Home />} />
                  <Route path="shop" element={<Shop />} />
                  <Route path="product/:id" element={<Product />} />
                  <Route path="cart" element={<Cart />} />
                  <Route path="checkout" element={<Checkout />} />
                  <Route path="services" element={<Services />} />
                  <Route path="account" element={<Account />} />
                  <Route path="order/:id" element={<OrderDetail />} />
                  <Route path="help/:topic" element={<Help />} />
                  <Route path="*" element={<Home />} />
                </Route>

                {/* Staff screens — OUTSIDE Layout, so they render full-screen with
                    their own navigation and no storefront chrome. */}
                <Route path="admin/sign-in" element={<AdminSignIn />} />
                <Route path="admin" element={<AdminRoute><Admin /></AdminRoute>} />
                <Route path="owner-sign-in" element={<AdminSignIn />} />
                <Route path="driver/sign-in" element={<DriverSignIn />} />
                <Route path="driver" element={<DriverRoute><Rider /></DriverRoute>} />
                <Route path="rider" element={<DriverRoute><Rider /></DriverRoute>} />
                <Route path="rider/sign-in" element={<DriverSignIn />} />
              </Routes>
            </Suspense>
          </HashRouter>
        </StoreProvider>
      </StaffAuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);
