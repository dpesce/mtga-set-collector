// docs/assets/js/calculator.js
//
// Browser port of set_collection_take01.py (plots omitted).
// Implements the same formulas + minimization over t=0..500.

const SETS_JSON_URL = new URL("../data/sets.json", import.meta.url);
const T_MAX = 1000;

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
  overrideC: document.getElementById("overrideC"),
  overrideU: document.getElementById("overrideU"),
  overrideR: document.getElementById("overrideR"),
  overrideM: document.getElementById("overrideM"),
  overrideAlpha: document.getElementById("overrideAlpha"),
  advResetBtn: document.getElementById("advResetBtn"),
  advDetails: document.getElementById("advDetails"),
  overrideVC: document.getElementById("overrideVC"),
  overrideVU: document.getElementById("overrideVU"),
  overrideVR: document.getElementById("overrideVR"),
  overrideVM: document.getElementById("overrideVM"),
};

let sets = [];

function escapeText(s) {
  return String(s ?? "");
}

function fmt2(x) {
  const r = Math.round((x + Number.EPSILON) * 100) / 100;
  return r.toFixed(2).replace(/\.?0+$/, "");
}

function parseNonNegIntOrZero(raw, fieldName) {
  const s = String(raw ?? "").trim();
  if (s === "") return 0;

  if (!/^(0|[1-9]\d*)$/.test(s)) {
    throw new Error(`"${fieldName}" must be an integer (0 or higher).`);
  }
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new Error(`"${fieldName}" must be an integer (0 or higher).`);
  }
  return n;
}

function parseOptionalNonNegInt(raw, fieldName) {
  const s = String(raw ?? "").trim();
  if (s === "") return null;
  if (!/^(0|[1-9]\d*)$/.test(s)) {
    throw new Error(`"${fieldName}" must be an integer (0 or higher).`);
  }
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new Error(`"${fieldName}" must be an integer (0 or higher).`);
  }
  return n;
}

function parseOptionalPositiveNumber(raw, fieldName) {
  const s = String(raw ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`"${fieldName}" must be a positive number.`);
  }
  return n;
}

function applyAdvancedOverrides(setObj) {
  // Track whether any override was provided
  let overridesApplied = false;

  const base = setObj.totalDistinct ?? {};
  const totals = {
    common: Number(base.common ?? 0),
    uncommon: Number(base.uncommon ?? 0),
    rare: Number(base.rare ?? 0),
    mythic: Number(base.mythic ?? 0),
  };

  // Totals overrides
  const oC = parseOptionalNonNegInt(els.overrideC?.value, "Override C");
  const oU = parseOptionalNonNegInt(els.overrideU?.value, "Override U");
  const oR = parseOptionalNonNegInt(els.overrideR?.value, "Override R");
  const oM = parseOptionalNonNegInt(els.overrideM?.value, "Override M");

  if (oC !== null) { totals.common = oC; overridesApplied = true; }
  if (oU !== null) { totals.uncommon = oU; overridesApplied = true; }
  if (oR !== null) { totals.rare = oR; overridesApplied = true; }
  if (oM !== null) { totals.mythic = oM; overridesApplied = true; }

  // Alpha override
  const oA = parseOptionalPositiveNumber(els.overrideAlpha?.value, "Override alpha (α)");
  const alpha = (oA !== null) ? oA : Number(setObj.alpha);
  if (oA !== null) overridesApplied = true;

  // Wildcard value overrides (packs per wildcard)
  const oVC = parseOptionalPositiveNumber(els.overrideVC?.value, "Override vC");
  const oVU = parseOptionalPositiveNumber(els.overrideVU?.value, "Override vU");
  const oVR = parseOptionalPositiveNumber(els.overrideVR?.value, "Override vR");
  const oVM = parseOptionalPositiveNumber(els.overrideVM?.value, "Override vM");

  if (oVC !== null || oVU !== null || oVR !== null || oVM !== null) overridesApplied = true;

  return {
    ...setObj,
    alpha,
    totalDistinct: totals,
    _overridesApplied: overridesApplied,
    _vOverrides: { vC: oVC, vU: oVU, vR: oVR, vM: oVM },
  };
}


function averageCollected(t, n, N, c) {
  if (N <= 0) return 0;
  if (c >= N) return N;
  const base = (N - n) / N;
  return N - (N - c) * Math.pow(base, t);
}

function packParameters(alpha) {
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

function packParametersForSet(setObj) {
  const alpha = Number(setObj.alpha);
  if (!Number.isFinite(alpha) || alpha <= 0) {
    throw new Error('Set "alpha" must be a positive number.');
  }

  let { nC, nU, nR, nM, wC, wU, wR, wM } = packParameters(alpha);

  const ov = (setObj && typeof setObj.overrides === "object" && setObj.overrides) ? setObj.overrides : {};

  const applyNonNeg = (key, current) => {
    if (ov[key] == null) return current;
    const v = Number(ov[key]);
    if (!Number.isFinite(v) || v < 0) {
      throw new Error(`Invalid set override "${key}" for ${setObj.code ?? "set"} (must be a nonnegative number).`);
    }
    return v;
  };

  const applyPos = (key, current) => {
    if (ov[key] == null) return current;
    const v = Number(ov[key]);
    if (!Number.isFinite(v) || v <= 0) {
      throw new Error(`Invalid set override "${key}" for ${setObj.code ?? "set"} (must be a positive number).`);
    }
    return v;
  };

  // Overrides from sets.json (if present)
  nC = applyNonNeg("nC", nC);
  nU = applyNonNeg("nU", nU);
  nR = applyNonNeg("nR", nR);
  nM = applyNonNeg("nM", nM);

  wC = applyPos("wC", wC);
  wU = applyPos("wU", wU);
  wR = applyPos("wR", wR);
  wM = applyPos("wM", wM);

  // Recompute wildcard values from (possibly overridden) w*
  const vC = 1 / wC;
  const vU = 1 / wU;
  const vR = 1 / wR;
  const vM = 1 / wM;

  return { nC, nU, nR, nM, wC, wU, wR, wM, vC, vU, vR, vM };
}

function validateInputs({ totals, owned }) {
  const { common: NC, uncommon: NU, rare: NR, mythic: NM } = totals;
  const { common: cC, uncommon: cU, rare: cR, mythic: cM } = owned;

  if (cC > NC || cU > NU || cR > NR || cM > NM) {
    throw new Error(
      "The number of owned cards of a single type must not exceed the number of cards of that type in the set."
    );
  }
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

  let { nC, nU, nR, nM, vC, vU, vR, vM } = packParametersForSet(setObj);

  // Optional user overrides for wildcard values (packs per wildcard)
  const vo = setObj._vOverrides || {};
  if (vo.vC != null) vC = vo.vC;
  if (vo.vU != null) vU = vo.vU;
  if (vo.vR != null) vR = vo.vR;
  if (vo.vM != null) vM = vo.vM;

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

    if (costTotal < bestCost) {
      bestCost = costTotal;
      bestT = t;
    }
  }

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
    expectedAfterPacks: { C: PCbest, U: PUbest, R: PRbest, M: PMbest },
  };
}

function bankersRoundInt(x) {
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

function renderRemainderLines(remC, remU, remR, remM) {
  const rows = [
    ["Commons", remC],
    ["Uncommons", remU],
    ["Rares", remR],
    ["Mythics", remM],
  ];

  return `
    <div class="rem-lines">
      ${rows.map(([k, v]) => `
        <div class="rem-line"><span class="key">${k}</span>: <strong>${v}</strong></div>
      `).join("")}
    </div>
  `;
}

function renderWildcardSummary(remC, remU, remR, remM) {
  const wcWord = (n) => (n === 1 ? "wildcard" : "wildcards");

  const lines = [
    [remC, `Common ${wcWord(remC)}`],
    [remU, `Uncommon ${wcWord(remU)}`],
    [remR, `Rare ${wcWord(remR)}`],
    [remM, `Mythic ${wcWord(remM)}`],
  ];

  return `
    <div style="margin-top:6px; font-size:16px; line-height:1.35;">
      ${lines
        .map(
          ([n, label]) =>
            `<div><strong>${n}</strong>&nbsp&nbsp&nbsp<span class="muted">${label}</span></div>`
        )
        .join("")}
    </div>
  `;
}

function renderResult(out, setObj) {
  const { totals, owned, perWildcardPackValue, bestT, bestCost, expectedAfterPacks } = out;
  const { NC, NU, NR, NM } = totals;
  const { vC, vU, vR, vM } = perWildcardPackValue;

  const expC = bankersRoundInt(expectedAfterPacks.C);
  const expU = bankersRoundInt(expectedAfterPacks.U);
  const expR = bankersRoundInt(expectedAfterPacks.R);
  const expM = bankersRoundInt(expectedAfterPacks.M);

  const remC = Math.max(0, NC - expC);
  const remU = Math.max(0, NU - expU);
  const remR = Math.max(0, NR - expR);
  const remM = Math.max(0, NM - expM);

  const setTitle = `${setObj.name} (${setObj.code})`;

  
  els.result.innerHTML = `<h3>Recommendation</h3><br>
  <div class="sub">${
    bestT === 0
      ? "You're already in a state of diminishing returns when opening packs; time to start cracking wildcards."
      : "Open packs first, then use wildcards to finish."
  }</div><br>

  <div class="result-grid">
    <div class="kpi">
      <div class="big">${bestT}</div>
      <div class="label">packs to open before crafting.</div><br>
      <div class="pills">
        <div class="pill">${setTitle}</div>
      </div>
    </div>

    <div class="kpi">
      ${renderWildcardSummary(remC, remU, remR, remM)}
    </div>
  </div>

  <div class="result-grid">
    <div class="kpi">
      <div class="section-title">Starting collection</div>
      ${renderBarRow("Common", owned.common, NC)}
      ${renderBarRow("Uncommon", owned.uncommon, NU)}
      ${renderBarRow("Rare", owned.rare, NR)}
      ${renderBarRow("Mythic", owned.mythic, NM)}
    </div>

    <div class="kpi">
      <div class="section-title">Expected after opening ${bestT} packs (before wildcards)</div>
      ${renderBarRow("Common", expC, NC)}
      ${renderBarRow("Uncommon", expU, NU)}
      ${renderBarRow("Rare", expR, NR)}
      ${renderBarRow("Mythic", expM, NM)}
    </div>
  </div>

  <div class="kpi" style="margin-top:10px;">
    <div class="section-title">Wildcard values in this model</div><br>
    <div class="sub">Each wildcard is treated as “worth” this many packs.</div><br>
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
  </div>`;
}

function renderSetMeta(setObj) {
  const t = setObj.totalDistinct ?? {};
  const alpha = setObj.alpha;
  const note = String(setObj.notes ?? "").trim();

  const bits = [];
  bits.push(`Total distinct — C:${t.common ?? 0}, U:${t.uncommon ?? 0}, R:${t.rare ?? 0}, M:${t.mythic ?? 0}`);
  if (alpha != null) bits.push(`M:R=1:${alpha}`);

  // Build DOM safely so notes can live on a new line
  els.setMeta.innerHTML = "";

  const summarySpan = document.createElement("span");
  summarySpan.textContent = bits.join(" • ");
  els.setMeta.appendChild(summarySpan);

  if (note) {
    els.setMeta.appendChild(document.createElement("br"));

    const noteSpan = document.createElement("span");
    noteSpan.textContent = note;
    els.setMeta.appendChild(noteSpan);
  }
}

function resetResult() {
  els.result.innerHTML = `<div class="result-empty">Run the calculator to see a recommendation.</div>`;
  els.result.classList.add("muted");
}

function setDefaultPlaceholder(el, value, formatter = (x) => String(x)) {
  if (!el) return;
  el.placeholder = `(use set default = ${formatter(value)})`;
}

function updateAdvancedPlaceholders(setObj) {
  const t = setObj.totalDistinct ?? {};
  const alpha = Number(setObj.alpha);

  // Totals
  setDefaultPlaceholder(els.overrideC, t.common ?? 0, (x) => String(Math.trunc(Number(x))));
  setDefaultPlaceholder(els.overrideU, t.uncommon ?? 0, (x) => String(Math.trunc(Number(x))));
  setDefaultPlaceholder(els.overrideR, t.rare ?? 0, (x) => String(Math.trunc(Number(x))));
  setDefaultPlaceholder(els.overrideM, t.mythic ?? 0, (x) => String(Math.trunc(Number(x))));

  // Alpha
  if (Number.isFinite(alpha) && alpha > 0) {
    setDefaultPlaceholder(els.overrideAlpha, alpha, (x) => String(x));
  } else if (els.overrideAlpha) {
    els.overrideAlpha.placeholder = "(use set default)";
  }

  // Wildcard values (set defaults, including any sets.json overrides)
  try {
    const { vC, vU, vR, vM } = packParametersForSet(setObj);
    setDefaultPlaceholder(els.overrideVC, vC, fmt2);
    setDefaultPlaceholder(els.overrideVU, vU, fmt2);
    setDefaultPlaceholder(els.overrideVR, vR, fmt2);
    setDefaultPlaceholder(els.overrideVM, vM, fmt2);
  } catch {
    if (els.overrideVC) els.overrideVC.placeholder = "(use set default)";
    if (els.overrideVU) els.overrideVU.placeholder = "(use set default)";
    if (els.overrideVR) els.overrideVR.placeholder = "(use set default)";
    if (els.overrideVM) els.overrideVM.placeholder = "(use set default)";
  }
}

async function init() {
  // Optional: show something immediately
  els.setSelect.disabled = true;
  els.setSelect.innerHTML = `<option value="">Loading…</option>`;

  const res = await fetch(SETS_JSON_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${SETS_JSON_URL.pathname} (HTTP ${res.status})`);
  sets = await res.json();

  els.setSelect.disabled = false;

  if (!Array.isArray(sets) || sets.length === 0) {
    throw new Error("sets.json is empty or invalid.");
  }

  els.setSelect.innerHTML = sets
    .map((s, i) => `<option value="${i}">${escapeText(s.name)} (${escapeText(s.code)})</option>`)
    .join("");

  renderSetMeta(sets[0]);
  updateAdvancedPlaceholders(sets[0]);

  els.setSelect.addEventListener("change", () => {
    els.err.textContent = "";
    const idx = Number(els.setSelect.value);
    renderSetMeta(sets[idx]);
    updateAdvancedPlaceholders(sets[idx]);
    resetResult();
  });

  els.runBtn.addEventListener("click", () => {
    els.err.textContent = "";

    try {
      const idx = Number(els.setSelect.value);
      const setObj = applyAdvancedOverrides(sets[idx]);

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

  // Pressing Enter in any input runs the calculation
  const enterTargets = [
    els.ownedCommon,
    els.ownedUncommon,
    els.ownedRare,
    els.ownedMythic,
    els.overrideC,
    els.overrideU,
    els.overrideR,
    els.overrideM,
    els.overrideAlpha,
    els.overrideVC,
    els.overrideVU,
    els.overrideVR,
    els.overrideVM,
  ].filter(Boolean);

  for (const el of enterTargets) {
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        els.runBtn.click();
      }
    });
  }

  if (els.advResetBtn) {
    els.advResetBtn.addEventListener("click", () => {
      els.overrideC.value = "";
      els.overrideU.value = "";
      els.overrideR.value = "";
      els.overrideM.value = "";
      els.overrideAlpha.value = "";
      els.overrideVC.value = "";
      els.overrideVU.value = "";
      els.overrideVR.value = "";
      els.overrideVM.value = "";
      
      const idx = Number(els.setSelect.value);
      updateAdvancedPlaceholders(sets[idx]);
    });
  }

}

init().catch((e) => {
  const msg = e?.message ? String(e.message) : String(e);
  const errEl = document.getElementById("err");
  if (errEl) errEl.textContent = msg;
  console.error(e);
});
