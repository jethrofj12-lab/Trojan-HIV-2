import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * HIV Memory T-cell Game — Simple Visual
 * Updates per your specs:
 * 1) Free virus (HIV) ONLY goes down when ART is ON (clearance while ART ON).
 * 2) Introduce Pathogen spawns a DIFFERENT pathogen (e.g., Influenza) with a different color,
 *    and reactivates latent cells. It is NOT the same as +50 HIV Virions.
 * 3) ACTIVE and LATENT cells release 5 HIV virions every 10 seconds (ART ON or OFF).
 * 4) When ART is OFF and an ACTIVE cell dies, it releases +50 HIV virions.
 */

const STATUS = {
  HEALTHY: "HEALTHY",
  LATENT: "LATENT",
  ACTIVE: "ACTIVE",
  DEAD: "DEAD",
};

const VIRUS = {
  HIV: "HIV",
  PATHOGEN: "PATHOGEN", // e.g., Influenza
};

export default function HIVMemoryTCellGame() {
  // --- Sim state ---
  const [running, setRunning] = useState(false);
  const [artOn, setArtOn] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  // --- World & population ---
  const worldW = 960;
  const worldH = 600;
  const cellCount = 1000;

  const initialCells = useMemo(() => placeCells(cellCount, worldW, worldH), []);
  const [cells, setCells] = useState(initialCells);

  // Virions (single array with type field)
  const [virions, setVirions] = useState(() =>
    spawnVirions(100, worldW, worldH, false, [], VIRUS.HIV)
  );

  // Cadences
  const infectAccumRef = useRef(0);     // infections every 2s when ART OFF (depends on HIV only)
  const trickleAccumRef = useRef(0);    // per-cell HIV trickle every 10s
  const clearAccumRef = useRef(0);      // HIV clearance only when ART ON

  // Death timing (ACTIVE cells): lag, then small chance each tick
  const TICK_MS = 320;
  const DEATH_DELAY_MS = 30_000;
  const DEATH_CHANCE_PER_TICK_AFTER_DELAY = 0.02;

  // ART ON converts ACTIVE -> LATENT (keep trickle behavior for LATENT too)
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
      setElapsedMs(ms => ms + TICK_MS);
      infectAccumRef.current += TICK_MS;
      trickleAccumRef.current += TICK_MS;
      clearAccumRef.current += TICK_MS;

      // 1) Virions drift (positions only)
      setVirions(vs => moveVirions(vs, worldW, worldH));

      // 2) Infections (ART OFF): HIV load drives infections
      if (!artOn && infectAccumRef.current >= 2000) {
        const steps = Math.floor(infectAccumRef.current / 2000);
        infectAccumRef.current -= steps * 2000;

        for (let s = 0; s < steps; s++) {
          setCells(prev => {
            const next = [...prev];
            const healthyIdx = [];
            for (let i = 0; i < next.length; i++) if (next[i].s === STATUS.HEALTHY) healthyIdx.push(i);
            if (!healthyIdx.length) return next;

            const hivCount = countVirionsByType(virions, VIRUS.HIV);
            const toInfect = Math.min(healthyIdx.length, 1 + Math.floor(hivCount / 100));

            for (let k = 0; k < toInfect; k++) {
              if (!healthyIdx.length) break;
              const idx = healthyIdx.splice(Math.floor(Math.random() * healthyIdx.length), 1)[0];
              const c = next[idx];
              next[idx] = { ...c, s: STATUS.ACTIVE, ageMs: 0, relMs: 0 }; // relMs = per-cell trickle timer
            }
            return next;
          });
        }
      }

      // 3) Per-cell trickle (ACTIVE & LATENT) + ACTIVE aging/death (death burst only when ART OFF)
      const hivAdds = [];
      const deathSites = [];

      setCells(prev =>
        prev.map(c => {
          // Both ACTIVE and LATENT drip HIV (5 every 10s per cell)
          if (c.s === STATUS.ACTIVE || c.s === STATUS.LATENT) {
            const rel = (c.relMs ?? 0) + TICK_MS;
            let releases = Math.floor(rel / 10_000);
            if (releases > 0) {
              for (let i = 0; i < releases; i++) {
                hivAdds.push(...spawnVirions(5, worldW, worldH, true, [{ x: c.x, y: c.y }], VIRUS.HIV));
              }
            }
            const relMs = rel - releases * 10_000;

            // ACTIVE also ages & may die (only matters if ACTIVE)
            if (c.s === STATUS.ACTIVE) {
              const age = (c.ageMs ?? 0) + TICK_MS;
              if (!artOn && age >= DEATH_DELAY_MS && Math.random() < DEATH_CHANCE_PER_TICK_AFTER_DELAY) {
                deathSites.push({ x: c.x, y: c.y });
                return { ...c, s: STATUS.DEAD, ageMs: 0, relMs: 0 };
              }
              return { ...c, ageMs: age, relMs };
            }
            return { ...c, relMs };
          }
          return c;
        })
      );

      // 4) Death burst (HIV +50) — ONLY when ART is OFF
      if (!artOn && deathSites.length) {
        for (const d of deathSites) {
          hivAdds.push(...spawnVirions(50, worldW, worldH, true, [d], VIRUS.HIV));
        }
      }

      // 5) HIV clearance ONLY when ART is ON
      //    (make it proportional so it trends downward even with trickle)
      let hivRemove = 0;
      if (artOn && clearAccumRef.current >= 1000) {
        const sec = Math.floor(clearAccumRef.current / 1000);
        clearAccumRef.current -= sec * 1000;
        // remove ~5% of current HIV per second (at least 1 if any)
        const hivCountNow = countVirionsByType(virions, VIRUS.HIV);
        hivRemove = Math.max(1, Math.floor(hivCountNow * 0.05)) * sec;
      }

      // 6) Apply virion updates in one setState
      setVirions(prev => {
        // move already done above; here we adjust counts
        let hiv = [];
        let other = [];
        for (const v of prev) {
          if (v.type === VIRUS.HIV) hiv.push(v);
          else other.push(v);
        }

        // HIV clearance (ART ON only)
        if (hivRemove > 0 && hiv.length > 0) {
          const keep = Math.max(0, hiv.length - hivRemove);
          hiv = hiv.slice(0, keep);
        }

        // Add new HIV from trickle & death
        if (hivAdds.length) hiv = hiv.concat(hivAdds);

        // Merge back
        return hiv.concat(other);
      });
    }, TICK_MS);

    return () => clearInterval(id);
  }, [running, artOn, cells, virions]);

  // Metrics
  const healthy = cells.filter(c => c.s === STATUS.HEALTHY).length;
  const dead = cells.filter(c => c.s === STATUS.DEAD).length;
  const active = cells.filter(c => c.s === STATUS.ACTIVE).length;
  const freeHIV = countVirionsByType(virions, VIRUS.HIV);
  const freePath = countVirionsByType(virions, VIRUS.PATHOGEN);

  // --- Controls ---
  function flushFreeVirus() {
    // Only clears HIV (viral load) per your wording; leave other pathogens
    setVirions(prev => prev.filter(v => v.type !== VIRUS.HIV));
  }

  function introducePathogen() {
    // Distinct from +50 HIV: spawn 50 NON-HIV pathogen particles near cells,
    // and reactivate latent cells (immune activation)
    const PATH_COUNT = 50;
    setVirions(vs =>
      vs.concat(spawnVirions(PATH_COUNT, worldW, worldH, true, cells, VIRUS.PATHOGEN))
    );
    setCells(prev =>
      prev.map(c => (c.s === STATUS.LATENT ? { ...c, s: STATUS.ACTIVE, ageMs: 0, relMs: c.relMs ?? 0 } : c))
    );
  }

  function addVirions(n = 50) {
    // Pure HIV addition
    setVirions(vs => vs.concat(spawnVirions(n, worldW, worldH, false, [], VIRUS.HIV)));
  }

  function reset() {
    setCells(placeCells(cellCount, worldW, worldH));
    setVirions(spawnVirions(100, worldW, worldH, false, [], VIRUS.HIV));
    setElapsedMs(0);
    infectAccumRef.current = 0;
    trickleAccumRef.current = 0;
    clearAccumRef.current = 0;
    setArtOn(false);
    setRunning(false);
  }

  return (
    <div className="w-full min-h-screen bg-zinc-950 text-zinc-100 p-6 flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-semibold">HIV &amp; Memory T-cells — Simple Visual</h1>
        <div className="flex items-center gap-2">
          <div className="px-3 py-1 rounded-xl bg-zinc-800/70 font-mono">{formatTime(elapsedMs)}</div>
          <button
            onClick={() => setRunning(r => !r)}
            className={`px-3 py-2 rounded-2xl ${running ? "bg-amber-600" : "bg-emerald-600"}`}
          >
            {running ? "Pause" : "Run"}
          </button>
          <button onClick={reset} className="px-3 py-2 rounded-2xl bg-zinc-700">Reset</button>
        </div>
      </header>

      {/* Layout */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Playfield */}
        <div className="col-span-2 rounded-3xl bg-zinc-900 p-4">
          <svg viewBox={`0 0 ${worldW} ${worldH}`} className="w-full h-[480px] md:h-[560px] rounded-2xl bg-zinc-950">
            {/* Virions */}
            <g>
              {virions.map((v, i) => (
                <circle
                  key={`v-${i}`}
                  cx={v.x}
                  cy={v.y}
                  r={1.6}
                  // COLORS: HIV (light gray), PATHOGEN (cyan)
                  fill={v.type === VIRUS.HIV ? "#9ca3af" : "#22d3ee"}
                  opacity="0.9"
                />
              ))}
            </g>

            {/* Cells */}
            <g>
              {cells.map((c, i) => {
                let fill = "#22c55e"; // healthy -> green
                let stroke = "transparent";
                if (c.s === STATUS.ACTIVE) fill = "#ef4444"; // red
                else if (c.s === STATUS.LATENT) { fill = "#f59e0b"; stroke = "#fde68a"; } // amber
                else if (c.s === STATUS.DEAD) fill = "#6b7280"; // gray

                return (
                  <circle
                    key={`c-${i}`}
                    cx={c.x}
                    cy={c.y}
                    r={c.r ?? 4}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={stroke === "transparent" ? 0 : 1}
                    opacity={c.s === STATUS.DEAD ? 0.5 : 0.9}
                  />
                );
              })}
            </g>
          </svg>
        </div>

        {/* Controls, Instructions, Metrics */}
        <div className="col-span-1 flex flex-col gap-4">
          {/* Controls */}
          <div className="rounded-3xl bg-zinc-900 p-4">
            <h2 className="text-lg font-semibold mb-2">Controls</h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setArtOn(a => !a)}
                className={`px-3 py-2 rounded-2xl ${artOn ? "bg-sky-600" : "bg-zinc-700"}`}
              >
                ART {artOn ? "ON" : "OFF"}
              </button>
              <button onClick={flushFreeVirus} className="px-3 py-2 rounded-2xl bg-zinc-700">
                Flush Free Virus
              </button>
              <button onClick={introducePathogen} className="px-3 py-2 rounded-2xl bg-zinc-700">
                Introduce Pathogen
              </button>
              <button onClick={() => addVirions(50)} className="px-3 py-2 rounded-2xl bg-zinc-700">
                +50 Virions (HIV)
              </button>
            </div>

            {/* Instructions */}
            <div className="mt-3 text-sm text-zinc-300 space-y-2">
              <ol className="list-decimal list-inside space-y-1">
                <li><b>Run / Pause:</b> Starts or pauses the simulation timer and movement.</li>
                <li>
                  <b>ART ON/OFF:</b>
                  <ul className="list-disc list-inside ml-5">
                    <li><b>ON:</b> blocks viral entry/replication → no new infections; HIV “free virus” clears over time.</li>
                    <li><b>OFF:</b> infections proceed; no HIV clearance.</li>
                  </ul>
                </li>
                <li><b>Flush Free Virus:</b> Clears HIV in the “blood” (viral load = 0) but doesn’t remove infected cells.</li>
                <li><b>Introduce Pathogen:</b> Spawns non-HIV pathogen particles (cyan) and reactivates latent cells (immune activation).</li>
                <li>
                  <b>+50 Virions:</b> Adds 50 HIV particles (light gray), representing either:
                  <ul className="list-disc list-inside ml-5">
                    <li>infected memory T-cells releasing virus, or</li>
                    <li>new HIV exposure (e.g., blood or sexual transmission).</li>
                  </ul>
                </li>
              </ol>
            </div>
          </div>

          {/* Metrics */}
          <div className="rounded-3xl bg-zinc-900 p-4">
            <h2 className="text-lg font-semibold mb-2">Metrics</h2>
            <ul className="grid grid-cols-2 gap-2 text-sm">
              <li className="flex justify-between"><span>Healthy</span><span className="font-mono">{healthy}</span></li>
              <li className="flex justify-between"><span>Dead memory t-cells</span><span className="font-mono">{dead}</span></li>
              <li className="flex justify-between"><span>Active infected</span><span className="font-mono">{active}</span></li>
              <li className="flex justify-between col-span-2"><span>Free HIV virus</span><span className="font-mono">{freeHIV}</span></li>
              <li className="flex justify-between col-span-2"><span>Other pathogen particles</span><span className="font-mono">{freePath}</span></li>
            </ul>

            <div className="mt-3 text-xs text-zinc-400 space-y-1">
              <p><b>Healthy:</b> number of uninfected memory T-cells.</p>
              <p><b>Dead memory t-cells:</b> infected and dead cells.</p>
              <p><b>Active infected:</b> cells currently making virus (producers).</p>
              <p><b>Free HIV virus:</b> “viral load / viral count” in this simplified visual.</p>
              <p className="mt-2">
                <b>Note:</b> This schematic visualization is not drawn to anatomical scale. Cell sizes, counts, and timing (including infection frequency) are intentionally simplified for educational purposes and do not represent clinical infection rates, transmission probabilities, or treatment performance.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* --------------------------- Helpers --------------------------- */

function formatTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  return `${m}:${ss}`;
}

function placeCells(n, w, h) {
  // Jittered grid for large n
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
  // Sparse random
  const cells = [];
  for (let i = 0; i < n; i++) {
    const x = 10 + Math.random() * (w - 20);
    const y = 10 + Math.random() * (h - 20);
    cells.push({ x, y, r: 4, s: STATUS.HEALTHY });
  }
  return cells;
}

function spawnVirions(n, w, h, centerBias = false, centers = [], type = VIRUS.HIV) {
  const vs = [];
  for (let i = 0; i < n; i++) {
    let x, y;
    if (centerBias && centers.length > 0) {
      const c = centers[Math.floor(Math.random() * centers.length)];
      x = c.x + (Math.random() - 0.5) * 20;
      y = c.y + (Math.random() - 0.5) * 20;
    } else {
      x = 10 + Math.random() * (w - 20);
      y = 10 + Math.random() * (h - 20);
    }
    vs.push({ x, y, vx: (Math.random() - 0.5) * 1.2, vy: (Math.random() - 0.5) * 1.2, type });
  }
  return vs;
}

function moveVirions(vs, w, h) {
  const next = new Array(vs.length);
  for (let i = 0; i < vs.length; i++) {
    const v = vs[i];
    let x = v.x + v.vx;
    let y = v.y + v.vy;
    let vx = v.vx;
    let vy = v.vy;

    // bounce off walls
    if (x < 2) { x = 2; vx = Math.abs(vx); }
    else if (x > w - 2) { x = w - 2; vx = -Math.abs(vx); }
    if (y < 2) { y = 2; vy = Math.abs(vy); }
    else if (y > h - 2) { y = h - 2; vy = -Math.abs(vy); }

    // slight random drift
    vx += (Math.random() - 0.5) * 0.1;
    vy += (Math.random() - 0.5) * 0.1;

    // clamp speed
    const speed = Math.hypot(vx, vy);
    const maxS = 1.6;
    if (speed > maxS) {
      vx = (vx / speed) * maxS;
      vy = (vy / speed) * maxS;
    }

    next[i] = { ...v, x, y, vx, vy };
  }
  return next;
}

function countVirionsByType(vs, type) {
  let n = 0;
  for (let i = 0; i < vs.length; i++) if (vs[i].type === type) n++;
  return n;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
