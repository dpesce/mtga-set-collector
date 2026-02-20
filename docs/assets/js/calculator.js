// docs/assets/js/calculator.js
//
// Browser port of set_collection_take01.py (plots omitted).
// Implements the same formulas + minimization over t=0..500, then prints a message.
// See Python reference: average_collected, cost_total, argmin, message formatting.

const SETS_JSON_PATH = "./assets/data/sets.json";
const T_MAX = 500;

const els = {
  setSelect: document.getElementById("setSelect"),
  setMeta: document.getElementById("setMeta"),
  ownedCommon: document.getElementById("ownedCommon"),
  ownedUncommon: document.getElementById("ownedUncommon"),
  ownedRare: document.getElementById("ownedRare"),
  ownedMythic: document.getElementById("ownedMythic"),
  runBtn: document.getElementById("runBtn"),
  err: document.getElementById("err"),
  result: document.getElementById("result"),
};

let sets = [];

function escapeText(s) {
  return String(s ?? "");
}

function fmt2(x) {
  // Similar intent to np.round(x,2) for display; we print up to 2 decimals but trim trailing zeros.
  const r = Math.round((x + Number.EPSILON) * 100) / 100;
  return r.toFixed(2).replace(/\.?0+$/, "");
}

function roundHalfToEvenInt(x) {
  // Mimic numpy's "banker's rounding" behavior for .5 cases (important if you want exact parity with np.round).
  // Values here should be non-negative in your model.
  const eps = 1e-12;
  const f = Math.floor(x);
  const frac = x - f;

  if (frac < 0.5 - eps) return f;
  if (frac > 0.5 + eps) return f + 1;

  // Exactly half (within eps)
  return (f % 2 === 0) ? f : (f + 1);
}

function parseNonNegIntOrZero(raw, fieldName) {
  const s = String(raw ?? "").trim();
  if (s === "") return 0;

  // Strict integer check (so "12.3" doesn't silently become 12 like parseInt would).
  if (!/^(0|[1-9]\d*)$/.test(s)) {
    throw new Error(`"${fieldName}" must be an integer (0 or higher).`);
  }
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new Error(`"${fieldName}" must be an integer (0 or higher).`);
  }
  return n;
}

function averageCollected(t, n, N, c) {
  // Python: N - (N-c)*(((N-n)/N)**t)
  // Guard: if N==0, treat as 0 cards exist, so collected is 0.
  if (N <= 0) return 0;

  // If already complete, stay complete.
  if (c >= N) return N;

  const base = (N - n) / N;
  return N - (N - c) * Math.pow(base, t);
}

function packParameters(alpha) {
  // Python per-pack expectations:
  // non-wildcards:
  // n_C = 14/3
  // n_U = 9/5
  // n_R = (1 - 1/alpha) * (1 - 1/30)
  // n_M = (1/alpha) * (1 - 1/30)
  //
  // wildcards:
  // w_C = 1/3
  // w_U = 11/30
  // w_R = (1/6) * (1 - 1/(5*alpha))
  // w_M = (1/30) * (1 + 1/alpha)

  const nC = 14 / 3;
  const nU = 9 / 5;
  const nR = (1 - 1 / alpha) * (1 - 1 / 30);
  const nM = (1 / alpha) * (1 - 1 / 30);

  const wC = 1 / 3;
  const wU = 11 / 30;
  const wR = (1 / 6) * (1 - 1 / (5 * alpha));
  const wM = (1 / 30) * (1 + 1 / alpha);

  const vC = 1 / wC;
  const vU = 1 / wU;
  const vR = 1 / wR;
  const vM = 1 / wM;

  return { nC, nU, nR, nM, wC, wU, wR, wM, vC, vU, vR, vM };
}

function validateInputs({ totals, owned }) {
  const { common: NC, uncommon: NU, rare: NR, mythic: NM } = totals;
  const { common: cC, uncommon: cU, rare: cR, mythic: cM } = owned;

  // Match Python intent: integers already enforced; now bounds checks.
  if (cC > NC || cU > NU || cR > NR || cM > NM) {
    throw new Error(
      "The number of owned cards of a single type must not exceed the number of cards of that type in the set."
    );
  }
  if (cC < 0 || cU < 0 || cR < 0 || cM < 0) {
    throw new Error("All four fields must be integers (0 or higher).");
  }
}

function rarityLine(owned, total, label) {
  if (total <= 0) return null;
  return `${owned} / ${total} ${label}`;
}

function computeStrategy(setObj, owned) {
  const totals = setObj.totalDistinct ?? {};
  const NC = Number(totals.common ?? 0);
  const NU = Number(totals.uncommon ?? 0);
  const NR = Number(totals.rare ?? 0);
  const NM = Number(totals.mythic ?? 0);

  const alpha = Number(setObj.alpha);
  if (!Number.isFinite(alpha) || alpha <= 0) {
    throw new Error('Set "alpha" must be a positive number.');
  }

  validateInputs({
    totals: { common: NC, uncommon: NU, rare: NR, mythic: NM },
    owned,
  });

  const { nC, nU, nR, nM, vC, vU, vR, vM } = packParameters(alpha);

  // Minimize cost_total over t = 0..T_MAX
  let bestT = 0;
  let bestCost = Number.POSITIVE_INFINITY;

  for (let t = 0; t <= T_MAX; t++) {
    const PC = averageCollected(t, nC, NC, owned.common);
    const PU = averageCollected(t, nU, NU, owned.uncommon);
    const PR = averageCollected(t, nR, NR, owned.rare);
    const PM = averageCollected(t, nM, NM, owned.mythic);

    const missC = (NC <= 0) ? 0 : (NC - PC);
    const missU = (NU <= 0) ? 0 : (NU - PU);
    const missR = (NR <= 0) ? 0 : (NR - PR);
    const missM = (NM <= 0) ? 0 : (NM - PM);

    const costTotal = t + missC * vC + missU * vU + missR * vR + missM * vM;

    // Match np.argmin behavior: keep earliest t if tied.
    if (costTotal < bestCost) {
      bestCost = costTotal;
      bestT = t;
    }
  }

  // Recompute values at the minimizer (like indexing arrays at ind_min)
  const PCbest = averageCollected(bestT, nC, NC, owned.common);
  const PUbest = averageCollected(bestT, nU, NU, owned.uncommon);
  const PRbest = averageCollected(bestT, nR, NR, owned.rare);
  const PMbest = averageCollected(bestT, nM, NM, owned.mythic);

  return {
    alpha,
    totals: { NC, NU, NR, NM },
    owned,
    perWildcardPackValue: { vC, vU, vR, vM },
    bestT,
    bestCost,
    expectedAfterPacks: {
      C: PCbest,
      U: PUbest,
      R: PRbest,
      M: PMbest,
    },
  };
}

function bankersRoundInt(x) {
  // Numpy-like half-to-even rounding for display parity
  const eps = 1e-12;
  const f = Math.floor(x);
  const frac = x - f;
  if (frac < 0.5 - eps) return f;
  if (frac > 0.5 + eps) return f + 1;
  return (f % 2 === 0) ? f : (f + 1);
}

function pct(have, total) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (have / total) * 100));
}

function rarityName(key) {
  return ({ C: "Commons", U: "Uncommons", R: "Rares", M: "Mythics" })[key] || key;
}

function renderBarRow(label, have, total) {
  const p = pct(have, total);
  const safeHave = Math.max(0, Math.min(total, have));
  const text = `${safeHave} / ${total}`;
  return `
    <div class="row">
      <div class="muted">${label}</div>
      <div class="bar"><div style="width:${p}%;"></div></div>
      <div>${text}</div>
    </div>
  `;
}

function renderResult(out, setObj) {
  const { totals, owned, perWildcardPackValue, bestT, bestCost, expectedAfterPacks } = out;
  const { NC, NU, NR, NM } = totals;
  const { vC, vU, vR, vM } = perWildcardPackValue;

  // Expected opened in packs (rounded for human-friendly display)
  const expC = bankersRoundInt(expectedAfterPacks.C);
  const expU = bankersRoundInt(expectedAfterPacks.U);
  const expR = bankersRoundInt(expectedAfterPacks.R);
  const expM = bankersRoundInt(expectedAfterPacks.M);

  // “Remaining after packs” — what you’d plan to cover with wildcards (expected)
  const remC = Math.max(0, NC - expC);
  const remU = Math.max(0, NU - expU);
  const remR = Math.max(0, NR - expR);
  const remM = Math.max(0, NM - expM);

  const setTitle = `${setObj.name} (${setObj.code})`;

  els.result.innerHTML = `
    <h3>Recommendation</h3>
    <div class="sub">
      Open packs first, then spend wildcards to finish the set.
    </div>

    <div class="result-grid">
      <div class="kpi">
        <div class="big">${bestT}</div>
        <div class="label">packs to open before using wildcards</div>
        <div class="pills">
          <div class="pill">α = ${out.alpha}</div>
          <div class="pill">${setTitle}</div>
        </div>
      </div>

      <div class="kpi">
        <div class="big">${(Math.round((bestCost + Number.EPSILON) * 100) / 100).toFixed(2).replace(/\.?0+$/,"")}</div>
        <div class="label">minimum expected “effective pack cost”</div>
        <div class="note">This is the model’s total cost metric (packs + wildcard-equivalent packs). Useful for comparisons, not a promise.</div>
      </div>
    </div>

    <div class="result-grid">
      <div class="kpi">
        <h3 style="margin-bottom:6px;">Starting collection</h3>
        ${renderBarRow("Common", owned.common, NC)}
        ${renderBarRow("Uncommon", owned.uncommon, NU)}
        ${renderBarRow("Rare", owned.rare, NR)}
        ${renderBarRow("Mythic", owned.mythic, NM)}
      </div>

      <div class="kpi">
        <h3 style="margin-bottom:6px;">Expected after opening ${bestT} packs</h3>
        ${renderBarRow("Common", expC, NC)}
        ${renderBarRow("Uncommon", expU, NU)}
        ${renderBarRow("Rare", expR, NR)}
        ${renderBarRow("Mythic", expM, NM)}
        <div class="note">
          Then plan to cover the remainder with wildcards (expected):
          <strong>${remC}C</strong>, <strong>${remU}U</strong>, <strong>${remR}R</strong>, <strong>${remM}M</strong>.
          Actual results vary.
        </div>
      </div>
    </div>

    <div class="kpi" style="margin-top:14px;">
      <h3 style="margin-bottom:6px;">Wildcard value in this model</h3>
      <div class="sub">Each wildcard is treated as “worth” this many packs (based on expected rates).</div>
      <table class="table">
        <thead>
          <tr><th>Wildcard</th><th>Equivalent packs</th></tr>
        </thead>
        <tbody>
          <tr><td>Common</td><td>${fmt2(vC)} packs</td></tr>
          <tr><td>Uncommon</td><td>${fmt2(vU)} packs</td></tr>
          <tr><td>Rare</td><td>${fmt2(vR)} packs</td></tr>
          <tr><td>Mythic</td><td>${fmt2(vM)} packs</td></tr>
        </tbody>
      </table>
      <div class="note">
        If your assumptions about pack contents or wildcard rates differ, update the model on the Math page and in the calculator code.
      </div>
    </div>
  `;
}

function renderSetMeta(setObj) {
  const t = setObj.totalDistinct ?? {};
  const alpha = setObj.alpha;

  const bits = [];
  bits.push(`Total distinct — C:${t.common ?? 0}, U:${t.uncommon ?? 0}, R:${t.rare ?? 0}, M:${t.mythic ?? 0}`);
  if (alpha != null) bits.push(`α=${alpha}`);
  if (setObj.notes) bits.push(String(setObj.notes).trim());

  els.setMeta.textContent = bits.filter(Boolean).join(" • ");
}

async function init() {
  // Load sets.json
  const res = await fetch(SETS_JSON_PATH, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${SETS_JSON_PATH} (HTTP ${res.status})`);
  sets = await res.json();

  if (!Array.isArray(sets) || sets.length === 0) {
    throw new Error("sets.json is empty or invalid.");
  }

  // Populate dropdown
  els.setSelect.innerHTML = sets
    .map((s, i) => `<option value="${i}">${escapeText(s.name)} (${escapeText(s.code)})</option>`)
    .join("");

  renderSetMeta(sets[0]);

  els.setSelect.addEventListener("change", () => {
    els.err.textContent = "";
    els.result.textContent = "No result yet.";
    els.result.classList.add("muted");

    const idx = Number(els.setSelect.value);
    renderSetMeta(sets[idx]);
  });

  els.runBtn.addEventListener("click", () => {
    els.err.textContent = "";

    try {
      const idx = Number(els.setSelect.value);
      const setObj = sets[idx];

      const owned = {
        common: parseNonNegIntOrZero(els.ownedCommon.value, "Owned Commons"),
        uncommon: parseNonNegIntOrZero(els.ownedUncommon.value, "Owned Uncommons"),
        rare: parseNonNegIntOrZero(els.ownedRare.value, "Owned Rares"),
        mythic: parseNonNegIntOrZero(els.ownedMythic.value, "Owned Mythics"),
      };

      const out = computeStrategy(setObj, owned);
      renderResult(out, setObj);
      els.result.classList.remove("muted");
    } catch (e) {
      els.err.textContent = e?.message ? String(e.message) : String(e);
    }
  });
}

init().catch((e) => {
  els.err.textContent = e?.message ? String(e.message) : String(e);
});
