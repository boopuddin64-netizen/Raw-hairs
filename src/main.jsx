import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { StoreProvider } from './store';
import { Layout } from './components';
import { ThemeProvider } from './theme/ThemeContext';
import Home from './pages/Home';
import Shop from './pages/Shop';
import Product from './pages/Product';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import Services from './pages/Services';
import Account from './pages/Account';
import OrderDetail from './pages/OrderDetail';
import Help from './pages/Help';
import './styles.css';
import './responsive.css';
import './light-mode-fixes.css';
import './interaction-fixes.css';

/*
 * PUBLIC STOREFRONT ENTRY.
 *
 * Phase A separation: this build contains ONLY customer pages. The admin
 * console and driver portal build separately from src/console-main.jsx into
 * their own deployment (BUILD_TARGET=console) on a private origin. There are
 * deliberately no admin/driver imports or routes here — verify with
 * `grep -ri "admin" dist/assets/` after a build.
 */
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <StoreProvider>
        <HashRouter>
          <Routes>
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
          </Routes>
        </HashRouter>
      </StoreProvider>
    </ThemeProvider>
  </React.StrictMode>
);
