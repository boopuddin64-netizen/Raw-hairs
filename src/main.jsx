import React from 'react';
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
import Shop from './pages/Shop';
import Product from './pages/Product';
import Cart from './pages/Cart';
import Services from './pages/Services';
import Account from './pages/Account';
import Help from './pages/Help';
import Admin from './pages/Admin';
import Rider from './pages/Rider';
import './styles.css';
import './responsive.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <StaffAuthProvider>
        <StoreProvider>
          <HashRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="shop" element={<Shop />} />
                <Route path="product/:id" element={<Product />} />
                <Route path="cart" element={<Cart />} />
                <Route path="services" element={<Services />} />
                <Route path="account" element={<Account />} />
                <Route path="help/:topic" element={<Help />} />
                <Route path="admin/sign-in" element={<AdminSignIn />} />
                <Route path="admin" element={<AdminRoute><Admin /></AdminRoute>} />
                <Route path="owner-sign-in" element={<AdminSignIn />} />
                <Route path="driver/sign-in" element={<DriverSignIn />} />
                <Route path="driver" element={<DriverRoute><Rider /></DriverRoute>} />
                <Route path="rider" element={<DriverRoute><Rider /></DriverRoute>} />
                <Route path="rider/sign-in" element={<DriverSignIn />} />
                <Route path="*" element={<Home />} />
              </Route>
            </Routes>
          </HashRouter>
        </StoreProvider>
      </StaffAuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);
