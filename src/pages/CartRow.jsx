import { useRef, useEffect, useState } from 'react';
import { naira, stockLabel } from '../store';

export default function CartRow({ line, onRemove, store }) {
  const ref = useRef(null);
  const [swiping, setSwiping] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return onSwipe(el, {
      onLeft: () => {
        setSwiping(true);
        setTimeout(() => onRemove(line.id, line.length), 180);
      },
    });
  }, [line.id, line.length, onRemove]);

  return (
    <article ref={ref} className={`row-card ${swiping ? 'removing' : ''}`}>
      <div className="photo" style={{ flex: '0 0 84px', height: 104 }}>
        {line.image_url
          ? <img src={line.image_url} alt={line.name} />
          : <span className="photo-tag">{line.name}</span>}
      </div>
      <div className="row-main">
        <div className="row-top">
          <h3>{line.name}</h3>
          <button
            className="icon-btn"
            aria-label={`Remove ${line.name}`}
            style={{ margin: '-10px -10px 0 0' }}
            onClick={() => onRemove(line.id, line.length)}
          >✕</button>
        </div>
        <span className="muted small">{line.category || 'Wig'}{line.length ? ` · ${line.length}` : ''}</span>
        <span className="small" style={{ color: line.qty >= line.stock ? 'var(--warn)' : 'var(--ok)' }}>
          {line.qty >= line.stock ? `${stockLabel(line)}. Quantity is at the limit.` : 'In stock'}
        </span>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
          <div className="qty">
            <button aria-label="Decrease quantity" onClick={() => store.setQty(line.id, line.length, line.qty - 1)}>−</button>
            <span>{line.qty}</span>
            <button aria-label="Increase quantity" onClick={() => store.setQty(line.id, line.length, line.qty + 1)}>+</button>
          </div>
          <span className="price">{naira(line.price == null ? null : line.price * line.qty)}</span>
        </div>
      </div>
      <div className="swipe-hint">Remove</div>
    </article>
  );
}
