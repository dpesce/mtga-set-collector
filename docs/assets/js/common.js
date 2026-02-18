export function setActiveNav() {
  const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  document.querySelectorAll('[data-nav]').forEach(a => {
    const href = (a.getAttribute('href') || '').toLowerCase();
    if (href === path) a.classList.add('active');
  });
}

export function clampInt(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number.parseInt(String(value).trim(), 10);
  if (Number.isNaN(n)) return { ok: false, value: 0 };
  return { ok: true, value: Math.min(Math.max(n, min), max) };
}
