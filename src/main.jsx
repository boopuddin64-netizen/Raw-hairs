import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { StoreProvider } from './store';
import { AuthProvider } from './AuthContext';
import { ThemeProvider } from './ThemeContext';
import { Layout } from './components';
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
import './premium.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
    <AuthProvider>
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
            <Route path="admin" element={<Admin />} />
            <Route path="rider" element={<Rider />} />
            <Route path="*" element={<Home />} />
          </Route>
        </Routes>
        </HashRouter>
      </StoreProvider>
    </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);
