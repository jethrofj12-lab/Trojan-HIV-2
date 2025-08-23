import React, { useEffect, useMemo, useRef, useState } from "react";

// ------------------------------------------------------------
// HIV Memory T-cell Game — Simple Visual (v0.3.2 — text update + latent logic for ART)
// ------------------------------------------------------------

const STATUS = {
  HEALTHY: "HEALTHY",
  LATENT: "LATENT",   // internal; not drawn, counted with ACTIVE in metrics
  ACTIVE: "ACTIVE",
  DEAD: "DEAD",
};

export default function HIVMemoryTCellGame() {
  const [running, setRunning] = useState(false);
  const [artOn, setArtOn] = useState(false); // default ART OFF
  const [showPathogenFX, setShowPathogenFX] = useState(false);

  // Stopwatch + infection accumulator (drives ART-OFF infections)
  const [elapsedMs, setElapsedMs] = useState(0);
  const infectAccumRef = useRef(0);

  function formatTime(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, "0");
    return `${m}:${ss}`;
  }

  // Playfield
  const worldW = 960;
  const worldH = 600;

  // Cells
  const cellCount = 1000;
  const initial = useMemo(() => placeCells(cellCount, worldW, worldH), []);
  const [cells, setCells] = useState(initial);

  // Free virus starts at 100; only changes via +50, Flush, or Introduce Pathogen
  const [virions, setVirions] = useState(() => spawnVirions(100, worldW, worldH));
  const [tick, setTick] = useState(0);

  // Death timing: active cells can only die after this delay (strong lag)
  const DEATH_DELAY_MS = 30000; // 30s lag before any deaths start
  const DEATH_CHANCE_PER_TICK_AFTER_DELAY = 0.02; // then small chance each tick

  // When ART turns ON, convert ACTIVE -> LATENT (quiet / internal)
  useEffect(() => {
    if (artOn) {
      setCells(prev =>
        prev.map(c => (c.s === STATUS.ACTIVE ? { ...c, s: STATUS.LATENT, ageMs: 0 } : c))
      );
    }
  }, [artOn]);

  // Main loop (~320ms)
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setTick(t => t + 1);
      setElapsedMs(ms => ms + 320);

      // Accumulator for 2s infection cadence (ART OFF only)
      infectAccumRef.current += 320;

      // 1) Virions drift (positions only) — no auto growth/decay
      setVirions(vs => moveVirions(vs, worldW, worldH));

      // 2) ART OFF → infections happen in batches every 2 seconds:
      //    infect 1 healthy + 1 more per +100 virions present.
      if (!artOn && infectAccumRef.current >= 2000) {
        const steps = Math.floor(infectAccumRef.current / 2000);
        infectAccumRef.current -= steps * 2000;
        for (let s = 0; s < steps; s++) {
          setCells(prev => {
            const next = [...prev];
            const healthyIdx = [];
            for (let i = 0; i < next.length; i++) if (next[i].s === STATUS.HEALTHY) healthyIdx.push(i);
            if (!healthyIdx.length) return next;

            const vCount = Array.isArray(virions) ? virions.length : 0;
            const toInfect = Math.min(healthyIdx.length, 1 + Math.floor(vCount / 100));

            for (let k = 0; k < toInfect; k++) {
              if (!healthyIdx.length) break;
              const idx = healthyIdx.splice(Math.floor(Math.random() * healthyIdx.length), 1)[0];
              const c = next[idx];
              // become ACTIVE immediately (no visible latent on infection)
              next[idx] = { ...c, s: STATUS.ACTIVE, ageMs: 0 };
            }
            return next;
          });
        }
      }

      // 3) Advance ACTIVE ages and handle deaths with a strong lag
      setCells(prev =>
        prev.map(c => {
          if (c.s !== STATUS.ACTIVE) return c;
          const age = (c.ageMs ?? 0) + 320;
          if (age >= DEATH_DELAY_MS && Math.random() < DEATH_CHANCE_PER_TICK_AFTER_DELAY) {
            return { ...c, s: STATUS.DEAD, ageMs: 0 };
          }
          return { ...c, ageMs: age };
        })
      );
    }, 320);
    return () => clearInterval(id);
  }, [running, artOn, cells, virions]);

  // Derived counts (latent counted together with active)
  const healthy = cells.filter(c => c.s === STATUS.HEALTHY).length;
  const active = cells.filter(c => c.s === STATUS.ACTIVE).length;
  const latent = cells.filter(c => c.s === STATUS.LATENT).length;
  const activeLatent = active + latent;
  const dead = cells.filter(c => c.s === STATUS.DEAD).length;

  // Actions
  function flushVirus() {
    setVirions([]);
  }

  function introducePathogen() {
    // Visual FX
    setShowPathogenFX(true);
    setTimeout(() => setShowPathogenFX(false), 800);

    // Pathogen increases free virus
    const PATHOGEN_VIRUS_BOOST = 100;
    setVirions(vs => vs.concat(spawnVirions(PATHOGEN_VIRUS_BOOST, worldW, worldH, true, cells)));

    // Reactivate latent cells → ACTIVE
    setCells(prev => prev.map(c => (c.s === STATUS.LATENT ? { ...c, s: STATUS.ACTIVE, ageMs: 0 } : c)));
  }

  // Manually introduce more free HIV virions
  function addVirions(n = 10) {
    setVirions(vs => vs.concat(spawnVirions(n, worldW, worldH)));
  }

  function reset() {
    setCells(placeCells(cellCount, worldW, worldH));
    setVirions(spawnVirions(100, worldW, worldH)); // reset back to 100
    setShowPathogenFX(false);
    setTick(0);
    setElapsedMs(0);
    infectAccumRef.current = 0;
    setArtOn(false);
    setRunning(false);
  }

  return (
    <div className="w-full min-h-screen bg-zinc-950 text-zinc-100 p-6 flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-semibold">HIV & Memory T-cells — Simple Visual</h1>
      <div className="flex items-center gap-2">
          <div className="px-3 py-1 rounded-xl bg-zinc-800/70 font-mono">{formatTime(elapsedMs)}</div>
          <button onClick={() => setRunning(r => !r)} className={`px-4 py-2 rounded-2xl shadow ${running ? "bg-amber-600" : "bg-emerald-600"}`}>{running ? "Pause" : "Run"}</button>
          <button onClick={reset} className="px-3 py-2 rounded-2xl bg-zinc-700">Reset</button>
        </div>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Playfield */}
        <div className="col-span-2">
          <div className="relative rounded-3xl bg-zinc-900 shadow-inner overflow-hidden" style={{ width: worldW, height: worldH }}>
            <svg width={worldW} height={worldH}>
              {/* Pathogen FX */}
              {showPathogenFX && (
                <g opacity={0.25}>
                  <Star cx={worldW*0.2} cy={worldH*0.3} r={70} />
                  <Star cx={worldW*0.6} cy={worldH*0.5} r={90} />
                  <Star cx={worldW*0.85} cy={worldH*0.2} r={60} />
                </g>
              )}

              {/* Cells (LATENT is hidden) */}
              {cells.map((c, i) => (
                <g key={i}>
                  {c.s === STATUS.HEALTHY && <circle cx={c.x} cy={c.y} r={c.r} className="fill-emerald-500" />}
                  {c.s === STATUS.ACTIVE && (
                    <circle cx={c.x} cy={c.y} r={c.r} className="fill-red-500">
                      <animate attributeName="r" values={`${c.r};${c.r+2};${c.r}`} dur="0.9s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {c.s === STATUS.DEAD && <circle cx={c.x} cy={c.y} r={c.r} className="fill-zinc-600" />}
                </g>
              ))}

              {/* Virions */}
              {virions.map((v, i) => (
                <circle key={i} cx={v.x} cy={v.y} r={3} className="fill-fuchsia-400" />
              ))}
            </svg>
          </div>
          <div className="flex flex-wrap gap-3 mt-3 text-xs text-zinc-300">
            <LegendDot cls="bg-emerald-500" label="Healthy memory T-cell" />
            <LegendDot cls="bg-red-500" label="Active infected" />
            <LegendDot cls="bg-zinc-600" label="Dead memory T-cell" />
            <LegendDot cls="bg-fuchsia-400" label="HIV virion" small />
          </div>
        </div>

        {/* Controls + explanations + metrics (your exact wording) */}
        <div className="rounded-3xl p-4 bg-zinc-900 shadow-inner flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Play</h2>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setArtOn(v => !v)} className={`px-3 py-2 rounded-2xl ${artOn ? "bg-indigo-500" : "bg-indigo-700"}`}>{artOn ? "ART: ON (suppresses spread)" : "ART: OFF"}</button>
            <button onClick={flushVirus} className="px-3 py-2 rounded-2xl bg-purple-800">Flush Free Virus</button>
            <button onClick={() => addVirions(50)} className="px-3 py-2 rounded-2xl bg-pink-600">+50 Virions</button>
            <button onClick={introducePathogen} className="px-3 py-2 rounded-2xl bg-rose-700">Introduce Pathogen</button>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <Metric label="Healthy" value={healthy} />
            <Metric label="Active/latent" value={activeLatent} />
            <Metric label="Dead memory t-cells" value={dead} />
            <Metric label="Free virus" value={virions.length} />
          </div>

          <div className="mt-3 text-sm text-zinc-200 space-y-3">
            <div>
              <p className="font-semibold">Controls and what they mean -</p>
              <ol className="list-decimal ml-5 space-y-1">
                <li><strong>Run / Pause:</strong> Starts or pauses the simulation timer and movement.</li>
                <li><strong>ART ON/OFF:</strong>
                  <ol className="list-[lower-alpha] ml-5 space-y-1 mt-1">
                    <li><strong>ON:</strong> Active cells become latent; blocks viral entry/replication, no new infections and producers don’t release new virus.</li>
                    <li><strong>OFF:</strong> Active Infected memory t-cells. infections proceed.</li>
                  </ol>
                </li>
                <li><strong>Flush Free Virus:</strong> Clears free virus in the “blood” (viral load → 0) but doesn’t remove infected cells.</li>
                <li><strong>Introduce Pathogen:</strong> Mimics a new infection that wakes up memory cells; latent cells can reactivate.</li>
                <li><strong>+50 Virions:</strong> Adds 50 free virus particles, this represents either:
                  <ol className="list-[lower-alpha] ml-5 space-y-1 mt-1">
                    <li>infected memory T-cells releasing virus or</li>
                    <li>new exposure entering the body (e.g., sharing needles with an infected person or sexual transmission).</li>
                  </ol>
                </li>
              </ol>
            </div>

            <div>
              <p className="font-semibold">Metrics -</p>
              <ol className="list-decimal ml-5 space-y-1">
                <li><strong>Healthy:</strong> number of uninfected memory T-cells.</li>
                <li><strong>Dead memory t-cells:</strong> infected and dead cells </li>
                <li><strong>Active/latent:</strong> cells currently active or latent (quiet).</li>
                <li><strong>Free virus:</strong> “viral load / viral count” in this simplified visual.</li>
              </ol>
            </div>

            <p className="text-[11px] text-zinc-400 leading-snug">
              <strong>Note:</strong> This schematic visualization is not drawn to anatomical scale. Cell sizes, counts, and timing; including infection frequency are intentionally simplified for educational purposes and do not represent clinical infection rates, transmission probabilities, or treatment performance.
            </p>
          </div>
        </div>
      </section>

      <footer className="text-[11px] text-zinc-500">v0.3.2 • Educational demo. Not medical advice.</footer>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="bg-zinc-800 rounded-2xl p-3">
      <div className="text-[11px] text-zinc-400">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function LegendDot({ cls, label, ring, small }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`rounded-full ${small ? "w-3 h-3" : "w-4 h-4"} ${ring ? "bg-zinc-900 border border-yellow-300" : cls}`} />
      <span>{label}</span>
    </div>
  );
}

function Star({ cx, cy, r }) {
  const spikes = 8;
  const path = [];
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (Math.PI * i) / spikes;
    const radius = i % 2 === 0 ? r : r * 0.45;
    path.push(`${i === 0 ? "M" : "L"}${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`);
  }
  path.push("Z");
  return <path d={path.join(" ")} className="fill-fuchsia-500" />;
}

// ---------- Layout helpers ----------
function placeCells(n, w, h) {
  // Jittered grid for big n (fast + even)
  if (n > 200) {
    const cols = Math.ceil(Math.sqrt((n * w) / h));
    const rows = Math.ceil(n / cols);
    const cellW = w / cols;
    const cellH = h / rows;
    const r = Math.max(3, Math.floor(Math.min(cellW, cellH) * 0.35));
    const cells = [];
    for (let i = 0; i < n; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const jitterX = (Math.random() - 0.5) * cellW * 0.4;
      const jitterY = (Math.random() - 0.5) * cellH * 0.4;
      const x = (col + 0.5) * cellW + jitterX;
      const y = (row + 0.5) * cellH + jitterY;
      cells.push({ x: clamp(x, 6, w - 6), y: clamp(y, 6, h - 6), r, s: STATUS.HEALTHY });
    }
    return cells;
  }

  // small-n fallback
  const cells = [];
  let tries = 0;
  while (cells.length < n && tries < 50000) {
    tries++;
    const r = 16;
    const x = 20 + Math.random() * (w - 40);
    const y = 20 + Math.random() * (h - 40);
    if (cells.every(c => dist(c.x, c.y, x, y) > c.r + r + 10)) {
      cells.push({ x, y, r, s: STATUS.HEALTHY });
    }
  }
  return cells;
}

function spawnVirions(n, w, h, centerBias = false, cells = []) {
  const vs = [];
  for (let i = 0; i < n; i++) {
    let x, y;
    if (centerBias && cells.length) {
      const c = cells[Math.floor(Math.random() * cells.length)];
      x = c.x + (Math.random() - 0.5) * 20;
      y = c.y + (Math.random() - 0.5) * 20;
    } else {
      x = 10 + Math.random() * (w - 20);
      y = 10 + Math.random() * (h - 20);
    }
    vs.push({ x, y, vx: (Math.random() - 0.5) * 1.2, vy: (Math.random() - 0.5) * 1.2 });
  }
  return vs;
}

function moveVirions(vs, w, h) {
  return vs.map(v => {
    let x = v.x + v.vx;
    let y = v.y + v.vy;
    let vx = v.vx;
    let vy = v.vy;
    if (x < 6 || x > w - 6) vx *= -1;
    if (y < 6 || y > h - 6) vy *= -1;
    return { x: clamp(x, 6, w - 6), y: clamp(y, 6, h - 6), vx, vy };
  });
}

function dist(x1, y1, x2, y2) {
  const dx = x1 - x2; const dy = y1 - y2; return Math.hypot(dx, dy);
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }










