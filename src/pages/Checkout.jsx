import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useStore, naira } from '../store';
import {
  reserveCartItems, createOrder, registerPaymentIntent, submitBankTransferReceipt,
  initializePaystackTransaction, verifyPaystackTransaction,
  secondsRemaining, formatKobo, checkoutErrorMessage, RESERVATION_MINUTES,
} from '../lib/checkout';

const STEPS = { DETAILS: 'details', PAY: 'pay', BANK: 'bank', DONE: 'done' };

function Countdown({ expiresAt, onExpire }) {
  const [left, setLeft] = useState(() => secondsRemaining(expiresAt));
  useEffect(() => {
    const t = setInterval(() => {
      const s = secondsRemaining(expiresAt);
      setLeft(s);
      if (s === 0) onExpire();
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt, onExpire]);
  const m = Math.floor(left / 60);
  const s = String(left % 60).padStart(2, '0');
  return (
    <span className="muted small" style={{ color: left < 120 ? 'var(--warn)' : undefined }}>
      Stock reserved for {m}:{s}
    </span>
  );
}

export default function Checkout() {
  const store = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const cart = store.cart;

  const [step, setStep] = useState(STEPS.DETAILS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null); // { order_id, total_kobo, subtotal_kobo, delivery_fee_kobo }
  const [expiry, setExpiry] = useState(null);
  const [bankForm, setBankForm] = useState({ senderName: '', bank: '', transferReference: '' });
  const [form, setForm] = useState({
    name: '', phone: '', email: '', state: '', city: '',
    address: '', instructions: '', paymentMethod: 'paystack',
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const subtotalKobo = useMemo(
    () => cart.reduce((a, l) => a + Math.round((Number(l.price) || 0) * 100) * l.qty, 0),
    [cart]
  );
  const payingRef = useRef(false);

  // Paystack callback: ?pay=<reference> -> verify with the server.
  const callbackRef = params.get('pay');
  const [verified, setVerified] = useState(null);
  useEffect(() => {
    if (!callbackRef || verified || payingRef.current) return;
    payingRef.current = true;
    (async () => {
      try {
        const result = await verifyPaystackTransaction(callbackRef);
        setVerified(result);
        store.clearCart();
      } catch (e) {
        setError(e.message);
        setVerified({ ok: false });
      } finally {
        payingRef.current = false;
      }
    })();
  }, [callbackRef, verified, store]);

  const startCheckout = async (e) => {
    e.preventDefault();
    if (cart.length === 0) { setError('Your bag is empty.'); return; }
    setError('');
    setBusy(true);
    try {
      // 1) Reserve stock atomically for 15 minutes.
      const reservation = await reserveCartItems(cart);
      setExpiry(reservation.expires_at);

      // 2) Create the server-priced order.
      const created = await createOrder(reservation.session_token, {
        name: form.name, phone: form.phone, email: form.email,
        address: form.address, state: form.state, city: form.city,
        instructions: form.instructions, paymentMethod: form.paymentMethod,
      });
      setOrder(created);
      store.clearCart();

      if (form.paymentMethod === 'bank_transfer') {
        setStep(STEPS.BANK);
        return;
      }

      // 3) Get the payment reference, then start Paystack.
      const intent = await registerPaymentIntent(created.order_id);
      const init = await initializePaystackTransaction({
        reference: intent.reference, email: form.email,
      });
      window.location.href = init.authorization_url; // hosted checkout
    } catch (err) {
      setError(checkoutErrorMessage(err.code) !== 'Something went wrong. Please try again.'
        ? checkoutErrorMessage(err.code)
        : (err.message || 'Could not start checkout. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const submitBankReceipt = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await submitBankTransferReceipt(order.order_id, {
        senderName: bankForm.senderName,
        bank: bankForm.bank,
        transferReference: bankForm.transferReference,
      });
      setStep(STEPS.DONE);
    } catch (err) {
      setError(err.message || 'Could not submit the receipt. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const expireReservation = () => {
    if (step === STEPS.DETAILS) {
      setError('Your reservation window passed. Please start again.');
    }
  };

  // ---- Paystack return screen -------------------------------------------
  if (callbackRef) {
    return (
      <div className="wrap page checkout-page checkout-result" style={{ maxWidth: 640 }}>
        <h1>Payment status</h1>
        {verified == null && <p className="muted">Confirming your payment…</p>}
        {verified?.ok === true && (
          <div className="notice" role="status">
            <p><strong>Payment confirmed.</strong> Thank you for your order!</p>
            {verified.order_id && (
              <p className="small">Order id: <code>{verified.order_id}</code></p>
            )}
            <p className="muted small">You will get an email receipt from Paystack. RAW HAIRS will contact you with delivery updates.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {verified.order_id && (
                <Link to={`/order/${verified.order_id}`} className="btn btn-primary">Track your order</Link>
              )}
              <Link to="/shop" className="btn btn-ghost">Continue shopping</Link>
            </div>
          </div>
        )}
        {verified?.ok === false && (
          <div className="notice auth-error" role="alert">
            <p><strong>Payment not confirmed yet.</strong></p>
            <p className="muted small">{error || 'If you completed the payment, it may take a moment. Contact RAW HAIRS on WhatsApp with your payment reference.'}</p>
            <p className="muted small">Reference: {callbackRef}</p>
          </div>
        )}
      </div>
    );
  }

  if (cart.length === 0 && !order) {
    return (
      <div className="wrap page checkout-page">
        <h1>Checkout</h1>
        <div className="placeholder-box" style={{ marginTop: 16 }}>
          <span className="big">Your bag is empty.</span>
          <Link to="/shop" className="btn btn-primary" style={{ marginTop: 8, alignSelf: 'flex-start' }}>Shop collection</Link>
        </div>
      </div>
    );
  }

  const lines = order ? [] : cart;

  return (
    <div className="wrap page checkout-page">
      <h1>Checkout</h1>
      {expiry && step !== STEPS.DONE && <Countdown expiresAt={expiry} onExpire={expireReservation} />}

      {/* Step: delivery details + payment method */}
      {step === STEPS.DETAILS && (
        <div className="checkout-grid">
          <form className="checkout-form stack" onSubmit={startCheckout} style={{ gap: 12 }}>
            <h2 style={{ fontSize: 18, fontWeight: 500 }}>Delivery details</h2>
            <div className="field"><label htmlFor="c-n">Your name</label><input id="c-n" required value={form.name} onChange={set('name')} /></div>
            <div className="field"><label htmlFor="c-p">Phone number</label><input id="c-p" required inputMode="tel" value={form.phone} onChange={set('phone')} /></div>
            <div className="field"><label htmlFor="c-e">Email (payment receipt)</label><input id="c-e" type="email" required value={form.email} onChange={set('email')} /></div>
            <div className="field"><label htmlFor="c-a">Delivery address</label><textarea id="c-a" rows="3" required value={form.address} onChange={set('address')} /></div>
            <div className="field"><label htmlFor="c-s">State</label><input id="c-s" required value={form.state} onChange={set('state')} /></div>
            <div className="field"><label htmlFor="c-c">City</label><input id="c-c" required value={form.city} onChange={set('city')} /></div>
            <div className="field"><label htmlFor="c-i">Delivery notes (optional)</label><textarea id="c-i" rows="2" value={form.instructions} onChange={set('instructions')} /></div>

            <h2 style={{ fontSize: 18, fontWeight: 500, marginTop: 8 }}>Payment method</h2>
            <div className="seg" role="group" aria-label="Payment method">
              <button type="button" aria-pressed={form.paymentMethod === 'paystack'} onClick={() => setForm({ ...form, paymentMethod: 'paystack' })}>Pay online (Paystack)</button>
              <button type="button" aria-pressed={form.paymentMethod === 'bank_transfer'} onClick={() => setForm({ ...form, paymentMethod: 'bank_transfer' })}>Bank transfer</button>
            </div>
            <p className="muted small">
              {form.paymentMethod === 'paystack'
                ? 'You pay securely on Paystack. We never see your card details.'
                : 'You transfer directly to our bank account and submit the transfer reference. We verify it before dispatch.'}
            </p>

            {error && <div className="notice auth-error" role="alert">{error}</div>}
            <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
              {busy ? 'Reserving stock…' : `Continue to payment`}
            </button>
            <p className="muted small">Stock is reserved for {RESERVATION_MINUTES} minutes while you complete payment. Delivery fee is shown on the order after the address is confirmed.</p>
          </form>

          <div className="checkout-summary stack">
            <h2 style={{ fontSize: 18, fontWeight: 500 }}>Your bag</h2>
            {lines.map((l) => (
              <div key={l.id + String(l.length)} className="summary">
                <div className="line"><span>{l.name}{l.length ? ` · ${l.length}` : ''} × {l.qty}</span><span>{naira((l.price || 0) * l.qty)}</span></div>
              </div>
            ))}
            <div className="summary" style={{ marginTop: 8 }}>
              <div className="line"><span className="muted">Subtotal</span><span>{naira(subtotalKobo / 100)}</span></div>
              <div className="line"><span className="muted">Delivery</span><span className="muted small">Confirmed with your order</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Step: bank transfer receipt */}
      {step === STEPS.BANK && order && (
        <div className="checkout-step-panel stack" style={{ maxWidth: 560 }}>
          <div className="notice" role="status">
            <p><strong>Order placed.</strong> Order id: <code>{order.order_id}</code></p>
            <p className="muted small">Amount to transfer: {formatKobo(order.total_kobo)}</p>
            <p className="muted small">Bank details were sent to your email. Submit your transfer reference below so we can verify it.</p>
            <p className="muted small">Save your order id — you can track the order any time from the Account page with it.</p>
          </div>
          <form className="stack" onSubmit={submitBankReceipt} style={{ gap: 12 }}>
            <div className="field"><label htmlFor="b-n">Sender name on the transfer</label><input id="b-n" required value={bankForm.senderName} onChange={(e) => setBankForm({ ...bankForm, senderName: e.target.value })} /></div>
            <div className="field"><label htmlFor="b-b">Bank you transferred from</label><input id="b-b" required value={bankForm.bank} onChange={(e) => setBankForm({ ...bankForm, bank: e.target.value })} /></div>
            <div className="field"><label htmlFor="b-r">Transfer reference / narration</label><input id="b-r" required value={bankForm.transferReference} onChange={(e) => setBankForm({ ...bankForm, transferReference: e.target.value })} /></div>
            {error && <div className="notice auth-error" role="alert">{error}</div>}
            <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
              {busy ? 'Submitting…' : 'Submit transfer receipt'}
            </button>
            <p className="muted small">Your order is dispatched only after we verify the transfer. You will be notified.</p>
          </form>
        </div>
      )}

      {/* Step: done (bank transfer) */}
      {step === STEPS.DONE && (
        <div className="checkout-step-panel stack" style={{ maxWidth: 560 }}>
          <div className="notice" role="status">
            <p><strong>Receipt received.</strong> Thank you!</p>
            <p className="muted small">We are verifying your transfer. Keep your order id: <code>{order?.order_id}</code></p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {order?.order_id && (
                <Link to={`/order/${order.order_id}`} className="btn btn-primary">Track your order</Link>
              )}
              <Link to="/shop" className="btn btn-ghost">Continue shopping</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
