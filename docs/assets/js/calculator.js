import { clampInt } from './common.js';

const els = {
  setSelect: document.getElementById('setSelect'),
  setMeta: document.getElementById('setMeta'),
  ownedCommon: document.getElementById('ownedCommon'),
  ownedUncommon: document.getElementById('ownedUncommon'),
  ownedRare: document.getElementById('ownedRare'),
  ownedMythic: document.getElementById('ownedMythic'),
  runBtn: document.getElementById('runBtn'),
  err: document.getElementById('err'),
  result: document.getElementById('result')
};

let sets = [];

function renderSetMeta(setObj) {
  const t = setObj.totalDistinct;
  els.setMeta.textContent =
    `Total distinct — C:${t.common}, U:${t.uncommon}, R:${t.rare}, M:${t.mythic}` +
    (setObj.notes ? ` • ${setObj.notes}` : '');
}

function parseInputs(setObj) {
  const t = setObj.totalDistinct;

  const c = clampInt(els.ownedCommon.value, 0, t.common);
  const u = clampInt(els.ownedUncommon.value, 0, t.uncommon);
  const r = clampInt(els.ownedRare.value, 0, t.rare);
  const m = clampInt(els.ownedMythic.value, 0, t.mythic);

  if (!c.ok || !u.ok || !r.ok || !m.ok) {
    return { ok: false, message: 'All four fields must be integers (0 or higher).' };
  }

  // ClampInt already caps at totals, but it’s good UX to tell people.
  const clamped =
    (Number.parseInt(els.ownedCommon.value || '0', 10) > t.common) ||
    (Number.parseInt(els.ownedUncommon.value || '0', 10) > t.uncommon) ||
    (Number.parseInt(els.ownedRare.value || '0', 10) > t.rare) ||
    (Number.parseInt(els.ownedMythic.value || '0', 10) > t.mythic);

  return {
    ok: true,
    owned: { common: c.value, uncommon: u.value, rare: r.value, mythic: m.value },
    totals: t,
    clamped
  };
}

/**
 * Replace this with your real math.
 * Keep it deterministic and side-effect free.
 */
function calculateStrategy({ setObj, owned, totals }) {
  const missing = {
    common: totals.common - owned.common,
    uncommon: totals.uncommon - owned.uncommon,
    rare: totals.rare - owned.rare,
    mythic: totals.mythic - owned.mythic
  };

  // Placeholder logic: not your real model.
  const completionPct =
    100 * (1 - (missing.common + missing.uncommon + missing.rare + missing.mythic) /
      (totals.common + totals.uncommon + totals.rare + totals.mythic));

  return {
    headline: `Estimated completion: ${completionPct.toFixed(1)}%`,
    recommendation: [
      `Missing: C=${missing.common}, U=${missing.uncommon}, R=${missing.rare}, M=${missing.mythic}`,
      `TODO: Replace this block with your computed optimal plan.`,
      `Example output: "Draft until rares are near-complete, then open packs; use wildcards for mythics last."`
    ].join('\n')
  };
}

async function init() {
  const res = await fetch('./assets/data/sets.json', { cache: 'no-store' });
  sets = await res.json();

  if (!Array.isArray(sets) || sets.length === 0) {
    els.err.textContent = 'sets.json is empty or invalid.';
    return;
  }

  els.setSelect.innerHTML = sets.map((s, i) =>
    `<option value="${i}">${s.name} (${s.code})</option>`
  ).join('');

  renderSetMeta(sets[0]);

  els.setSelect.addEventListener('change', () => {
    const idx = Number.parseInt(els.setSelect.value, 10);
    renderSetMeta(sets[idx]);
    els.err.textContent = '';
  });

  els.runBtn.addEventListener('click', () => {
    els.err.textContent = '';
    const idx = Number.parseInt(els.setSelect.value, 10);
    const setObj = sets[idx];

    const parsed = parseInputs(setObj);
    if (!parsed.ok) {
      els.err.textContent = parsed.message;
      return;
    }
    if (parsed.clamped) {
      els.err.textContent = 'One or more values exceeded the set total; values were capped.';
    }

    const out = calculateStrategy({ setObj, owned: parsed.owned, totals: parsed.totals });
    els.result.textContent = `${out.headline}\n\n${out.recommendation}`;
    els.result.classList.remove('muted');
  });
}

init().catch(err => {
  els.err.textContent = `Failed to load calculator data: ${err?.message || String(err)}`;
});
