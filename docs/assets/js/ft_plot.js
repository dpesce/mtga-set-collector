// docs/assets/js/ft_plot.js
//
// Stable computation of F_t(n,N) using a Markov chain on the number of distinct cards collected.
// State s = number collected so far (0..N).
// One pack draws n cards uniformly without replacement from N cards.
// If you have s collected, then X = number of new cards in the next pack is hypergeometric:
//   P(X=x | s) = C(N-s, x) * C(s, n-x) / C(N, n)
// Next state: s' = s + x
//
// F_t(n,N) = P(state=N after t packs).

function $(id) {
  return document.getElementById(id);
}

function buildLogFactorials(maxN) {
  const lf = new Float64Array(maxN + 1);
  lf[0] = 0;
  for (let i = 1; i <= maxN; i++) lf[i] = lf[i - 1] + Math.log(i);
  return lf;
}

function logChoose(lf, n, k) {
  if (k < 0 || k > n) return -Infinity;
  return lf[n] - lf[k] - lf[n - k];
}

function buildTransitions(N, n, lf) {
  // transitions[s] = { minX, probs(Float64Array) } for x in [minX..maxX]
  const transitions = new Array(N + 1);
  const logDen = logChoose(lf, N, n);

  for (let s = 0; s <= N; s++) {
    const missing = N - s;
    const minX = Math.max(0, n - s);
    const maxX = Math.min(n, missing);

    const len = maxX - minX + 1;
    const probs = new Float64Array(len);

    let sum = 0;
    for (let x = minX; x <= maxX; x++) {
      const logP =
        logChoose(lf, missing, x) +
        logChoose(lf, s, n - x) -
        logDen;

      const p = Math.exp(logP);
      probs[x - minX] = p;
      sum += p;
    }

    // Normalize to exactly 1 (helps tiny floating drift)
    if (sum > 0) {
      for (let i = 0; i < probs.length; i++) probs[i] /= sum;
    }

    transitions[s] = { minX, probs };
  }

  return transitions;
}

function ftSeriesDP(n, N) {
  // Keep plot range reasonable; scale with N but cap.
  const tMax = Math.min(1500, Math.max(50, Math.ceil(6 * N)));

  const lf = buildLogFactorials(N);
  const transitions = buildTransitions(N, n, lf);

  const x = new Array(tMax + 1);
  const y = new Array(tMax + 1);

  let p = new Float64Array(N + 1);
  let pNext = new Float64Array(N + 1);
  p[0] = 1;

  // t = 0
  x[0] = 0;
  y[0] = p[N]; // 0 if N>0

  for (let t = 1; t <= tMax; t++) {
    pNext.fill(0);

    for (let s = 0; s <= N; s++) {
      const ps = p[s];
      if (ps === 0) continue;

      const tr = transitions[s];
      const minX = tr.minX;
      const probs = tr.probs;

      for (let i = 0; i < probs.length; i++) {
        const xNew = minX + i;
        pNext[s + xNew] += ps * probs[i];
      }
    }

    // swap
    const tmp = p; p = pNext; pNext = tmp;

    x[t] = t;
    // clamp tiny negative/over-1 noise (should be extremely small)
    const val = p[N];
    y[t] = Math.max(0, Math.min(1, val));
  }

  return { x, y, tMax };
}

function getTheme() {
  const cs = getComputedStyle(document.documentElement);
  return {
    text: cs.getPropertyValue("--text").trim() || "#e6edf3",
    muted: cs.getPropertyValue("--muted").trim() || "#9aa7b2",
    border: cs.getPropertyValue("--border").trim() || "#223042",
  };
}

let pending = false;
function scheduleRender() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    render();
  });
}

function pdfFromCdf(y) {
  const p = new Array(y.length);
  if (y.length === 0) return p;

  // For this problem F_0 is typically 0, so this is effectively 0.
  p[0] = Math.max(0, Math.min(1, y[0]));

  for (let t = 1; t < y.length; t++) {
    // Numerical guard against tiny negative roundoff
    p[t] = Math.max(0, y[t] - y[t - 1]);
  }

  return p;
}

function render() {
  const NEl = $("ftN");
  const nEl = $("ftn");
  const NVal = $("ftNVal");
  const nVal = $("ftnVal");
  const ftPlotDiv = $("ftPlot");
  const ptPlotDiv = $("ptPlot");

  if (!NEl || !nEl || !ftPlotDiv) return;

  let N = Number(NEl.value);
  let n = Number(nEl.value);

  // keep n <= N and keep slider max synced
  nEl.max = String(N);
  if (n > N) {
    n = N;
    nEl.value = String(n);
  }

  if (NVal) NVal.textContent = String(N);
  if (nVal) nVal.textContent = String(n);

  const { x, y, tMax } = ftSeriesDP(n, N);   // y = F_t(n,N)
  const yPdf = pdfFromCdf(y);                // yPdf = P_t(n,N)
  const theme = getTheme();

  // ----- Top plot: F_t(n,N) (unchanged behavior) -----
  const ftData = [{
    x,
    y,
    mode: "lines",
    line: { width: 2 },
    hovertemplate: "t=%{x}<br>F=%{y:.6f}<extra></extra>",
  }];

  const ftLayout = {
    margin: { l: 60, r: 18, t: 10, b: 60 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { color: theme.text },
    xaxis: {
      title: { text: "Number of packs opened", standoff: 12 },
      automargin: true,
      range: [0, tMax], // shared horizontal range
      gridcolor: theme.border,
      zerolinecolor: theme.border,
    },
    yaxis: {
      title: { text: "Cumulative distribution value", standoff: 10 },
      automargin: true,
      range: [0, 1],
      gridcolor: theme.border,
      zerolinecolor: theme.border,
    },
    showlegend: false,
  };

  const config = { responsive: true, displayModeBar: false };

  window.Plotly.react(ftPlotDiv, ftData, ftLayout, config);

  // ----- Bottom plot: P_t(n,N) -----
  if (ptPlotDiv) {
    let maxPdf = 0;
    for (let i = 0; i < yPdf.length; i++) {
      if (yPdf[i] > maxPdf) maxPdf = yPdf[i];
    }
    const yMaxPdf = maxPdf > 0 ? Math.min(1, maxPdf * 1.08) : 1;

    const ptData = [{
      x,
      y: yPdf,
      mode: "lines",
      line: { width: 2 },
      hovertemplate: "t=%{x}<br>P=%{y:.6f}<extra></extra>",
    }];

    const ptLayout = {
      margin: { l: 60, r: 18, t: 10, b: 60 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { color: theme.text },
      xaxis: {
        title: { text: "Number of packs opened", standoff: 12 },
        automargin: true,
        range: [0, tMax], // shared horizontal range
        gridcolor: theme.border,
        zerolinecolor: theme.border,
      },
      yaxis: {
        title: { text: "Probability distribution value", standoff: 10 },
        automargin: true,
        range: [0, yMaxPdf],
        gridcolor: theme.border,
        zerolinecolor: theme.border,
      },
      showlegend: false,
    };

    window.Plotly.react(ptPlotDiv, ptData, ptLayout, config);
  }
}

function bind() {
  const NEl = $("ftN");
  const nEl = $("ftn");
  if (!NEl || !nEl) return;

  NEl.addEventListener("input", scheduleRender);
  nEl.addEventListener("input", scheduleRender);
  render();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bind);
} else {
  bind();
}
