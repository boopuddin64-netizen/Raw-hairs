/** Lightweight touch gesture helpers. No external deps. */

export function onSwipe(el, { onLeft, onRight, threshold = 48 } = {}) {
  if (!el) return () => {};
  let startX = 0;
  let startY = 0;
  let tracking = false;

  const start = (e) => {
    const t = e.touches?.[0];
    if (!t) return;
    startX = t.clientX;
    startY = t.clientY;
    tracking = true;
  };
  const end = (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches?.[0];
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) onLeft?.(e);
    else onRight?.(e);
  };

  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchend', end, { passive: true });
  return () => {
    el.removeEventListener('touchstart', start);
    el.removeEventListener('touchend', end);
  };
}

export function enablePinchZoom(el, { max = 3, min = 1 } = {}) {
  if (!el) return () => {};
  let scale = 1;
  let startDist = 0;
  let startScale = 1;

  const dist = (touches) => {
    const [a, b] = touches;
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };

  const start = (e) => {
    if (e.touches.length === 2) {
      startDist = dist(e.touches);
      startScale = scale;
    }
  };
  const move = (e) => {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    const next = startScale * (dist(e.touches) / startDist);
    scale = Math.min(max, Math.max(min, next));
    el.style.transform = `scale(${scale})`;
    el.style.transformOrigin = 'center center';
  };
  const end = () => {
    if (scale < 1.05) {
      scale = 1;
      el.style.transform = '';
    }
  };

  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchmove', move, { passive: false });
  el.addEventListener('touchend', end);
  return () => {
    el.removeEventListener('touchstart', start);
    el.removeEventListener('touchmove', move);
    el.removeEventListener('touchend', end);
  };
}

export function onPullToRefresh(el, { onRefresh, threshold = 72 } = {}) {
  if (!el) return () => {};
  let startY = 0;
  let pulling = false;

  const start = (e) => {
    if (window.scrollY > 4) return;
    startY = e.touches?.[0]?.clientY || 0;
    pulling = true;
  };
  const move = (e) => {
    if (!pulling) return;
    const dy = (e.touches?.[0]?.clientY || 0) - startY;
    if (dy > threshold && window.scrollY < 8) {
      pulling = false;
      onRefresh?.();
    }
  };
  const end = () => { pulling = false; };

  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchmove', move, { passive: true });
  el.addEventListener('touchend', end);
  return () => {
    el.removeEventListener('touchstart', start);
    el.removeEventListener('touchmove', move);
    el.removeEventListener('touchend', end);
  };
}

export function onLongPress(el, { onLongPress, delay = 480 } = {}) {
  if (!el) return () => {};
  let timer = 0;
  const start = () => {
    clearTimeout(timer);
    timer = setTimeout(() => onLongPress?.(), delay);
  };
  const cancel = () => clearTimeout(timer);

  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchend', cancel);
  el.addEventListener('touchmove', cancel);
  el.addEventListener('touchcancel', cancel);
  return () => {
    clearTimeout(timer);
    el.removeEventListener('touchstart', start);
    el.removeEventListener('touchend', cancel);
    el.removeEventListener('touchmove', cancel);
    el.removeEventListener('touchcancel', cancel);
  };
}
