import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * HIV Memory T-cell Game — Simple Visual
 * - Active cells drip 5 virions every 10 seconds
 * - When an ACTIVE cell dies, it releases 50 virions
 * - ART ON: ACTIVE -> LATENT (no trickle while latent)
 * - Infection cadence (ART OFF): every 2s infect 1 healthy + 1 per +100 virions
 */

const STATUS = {
  HEALTHY: "HEALTHY",
  LATENT: "LATENT", // internal; not drawn distinctly in metrics (we show together with ACTIVE if desired)
  ACTIVE: "ACTIVE",
  DEAD: "DEAD",
};

export default function HIVMemoryTCellGame() {
  // --- Simulation toggles/state ---
  const [running, setRunning] = useState(false);
  const [artOn, setArtOn] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [tick, setTick] = useState(0);

  // --- World & population ---
  const worldW = 960;
  const worldH = 600;
  const cellCount = 1000;

  // Place cells in a jittered grid for performance and visual distribution
  const initialCells = useMemo(() => placeCells(cellCount, worldW, worldH), []);
  const [cells, setCells] = useState(initialCells);

  // Virions: start at 100
  const [virions, setVirions] = useState(() => spawnVirions(100, worldW, worldH));

  // Infection cadence accumulator (ART OFF)
  const infectAccumRef = useRef(0);

  // Death timing: ACTIVE cells can only die after this delay; then a small chance per tick
  const DEATH_DELAY_MS = 30_000; // 30s lag
  const DEATH_CHANCE_PER_TICK_AFTER_DELAY = 0.02; // 2% per tick (~320ms)

  // When ART turns ON, convert ACTIVE -> LATENT and reset their trickle timers
  useEffect(() => {
    if (artOn) {
      setCells(prev =>
        prev.map(c => (c.s === STATUS.ACTIVE ? { ...c, s: STATUS.LATENT, ageMs: 0, relMs: 0 } : c))
      );
    }
  }, [artOn]);

  // Main loop (~320ms)
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setTick(t => t + 1);
      setElapsedMs(ms => ms + 320);
      infectAccumRef.current += 320;

      // 1) Virions drift (positions only)
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
              next[idx] = { ...c, s: STATUS.ACTIVE, ageMs: 0, relMs: 0 }; // relMs starts trickle timer
            }
            return next;
          });
        }
      }

      // 3) Active cells trickle release + age + handle deaths (with lag)
      const trickleSpawns = [];
      const deathSpawns = [];
      setCells(prev =>
        prev.map(c => {
          if (c.s !== STATUS.ACTIVE) return c;

          // accumulate trickle timer; every 10s release 5 virions
          const rel = (c.relMs ?? 0) + 320;
          let releases = Math.floor(rel / 10_000); // 10s
          if (releases > 0) {
            for (let i = 0; i < releases; i++) {
              trickleSpawns.push({ x: c.x, y: c.y, n: 5 });
            }
          }
          const relMs = rel - releases * 10_000;

          // age and possible death (after strong lag)
          const age = (c.ageMs ?? 0) + 320;
          if (age >= DEATH_DELAY_MS && Math.random() < DEATH_CHANCE_PER_TICK_AFTER_DELAY) {
            // death burst of 50 virions at the cell location
            deathSpawns.push({ x: c.x, y: c.y, n: 50 });
            return { ...c, s: STATUS.DEAD, ageMs: 0, relMs: 0 };
          }

          return { ...c, ageMs: age, relMs };
        })
      );

      // After updating cells, add any spawned virions near their source
      if (trickleSpawns.length || deathSpawns.length) {
        const add = [];
        for (const { x, y, n } of trickleSpawns) {
          add.push(...spawnVirions(n, worldW, worldH, true, [{ x, y }]));
        }
        for (const { x, y, n } of deathSpawns) {
          add.push(...spawnVirions(n, worldW, worldH, true, [{ x, y }]));
        }
        if (add.length) {
          setVirions(vs => vs.concat(add));
        }
      }
    }, 320);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, artOn, cells, virions]);

  // Derived counts (you can choose to display latent separately if you want)
  const healthy = cells.filter(c => c.s === STATUS.HEALTHY).length;
  const active = cells.filter(c => c.s === STATUS.ACTIVE).length;
  const latent = cells.filter(c => c.s === STATUS.LATENT).length;
  const activeLatent = active + latent;
  const dead = cells.filter(c => c.s === STATUS.DEAD).length;
  const freeVirus = Array.isArray(virions) ? virions.length : 0;

  // UI handlers
  function flushFreeVirus() {
    setVirions([]);
  }

  function introducePathogen() {
    // Boost free virus near random cells and reactivate latent cells
    const PATHOGEN_VIRUS_BOOST = 100;
    setVirions(vs => vs.concat(spawnVirions(PATHOGEN_VIRUS_BOOST, worldW, worldH, true, cells)));
    setCells(prev =>
      prev.map(c => (c.s === STATUS.LATENT ? { ...c, s: STATUS.ACTIVE, ageMs: 0, relMs: 0 } : c))
    );
  }

  function addVirions(n = 50) {
    setVirions(vs => vs.concat(spawnVirions(n, worldW, worldH)));
  }

  function reset() {
    setCells(placeCells(cellCount, worldW, worldH));
    setVirions(spawnVirions(100, worldW, worldH)); // reset back to 100
    setTick(0);
    setElapsedMs(0);
    infectAccumRef.current = 0;
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
          <button onClick={reset} className="px-3 py-2 rounded-2xl bg-zinc-700">
            Reset
          </button>
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
                <circle key={`v-${i}`} cx={v.x} cy={v.y} r={1.6} fill="#9ca3af" opacity="0.9" />
              ))}
            </g>

            {/* Cells */}
            <g>
              {cells.map((c, i) => {
                let fill = "#22c55e"; // healthy = green
                let stroke = "transparent";
                if (c.s === STATUS.ACTIVE) fill = "#ef4444"; // red
                else if (c.s === STATUS.LATENT) {
                  fill = "#f59e0b"; // amber
                  stroke = "#fde68a";
                } else if (c.s === STATUS.DEAD) fill = "#6b7280"; // gray

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

        {/* Controls & Metrics */}
        <div className="col-span-1 flex flex-col gap-4">
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
                +50 Virions
              </button>
            </div>
            <p className="text-xs text-zinc-400 mt-2">
              ART ON: ACTIVE → LATENT; latent cells don’t trickle virus.
            </p>
          </div>

          <div className="rounded-3xl bg-zinc-900 p-4">
            <h2 className="text-lg font-semibold mb-2">Metrics</h2>
            <ul className="grid grid-cols-2 gap-2 text-sm">
              <li className="flex justify-between">
                <span>Healthy</span>
                <span className="font-mono">{healthy}</span>
              </li>
              <li className="flex justify-between">
                <span>Active infected</span>
                <span className="font-mono">{active}</span>
              </li>
              <li className="flex justify-between">
                <span>Latent</span>
                <span className="font-mono">{latent}</span>
              </li>
              <li className="flex justify-between">
                <span>Dead memory T-cells</span>
                <span className="font-mono">{dead}</span>
              </li>
              <li className="flex justify-between col-span-2">
                <span>Free virus</span>
                <span className="font-mono">{freeVirus}</span>
              </li>
            </ul>
          </div>

          <div className="rounded-3xl bg-zinc-900 p-4">
            <h2 className="text-lg font-semibold mb-2">Notes</h2>
            <ul className="list-disc list-inside text-sm text-zinc-300 space-y-1">
              <li>Active cells drip 5 virions / 10s.</li>
              <li>Death releases 50 virions at the cell’s location.</li>
              <li>ART suppresses new infections and converts ACTIVE → LATENT.</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

/* -------------------------- helpers -------------------------- */

function formatTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  return `${m}:${ss}`;
}

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

  // Sparse random placement
  const cells = [];
  for (let i = 0; i < n; i++) {
    const x = 10 + Math.random() * (w - 20);
    const y = 10 + Math.random() * (h - 20);
    cells.push({ x, y, r: 4, s: STATUS.HEALTHY });
  }
  return cells;
}

function spawnVirions(n, w, h, centerBias = false, centers = []) {
  // centers: optional array of {x,y} to bias spawning near
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
    vs.push({ x, y, vx: (Math.random() - 0.5) * 1.2, vy: (Math.random() - 0.5) * 1.2 });
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
    // clamp speeds
    const speed = Math.hypot(vx, vy);
    const maxS = 1.6;
    if (speed > maxS) {
      vx = (vx / speed) * maxS;
      vy = (vy / speed) * maxS;
    }

    next[i] = { x, y, vx, vy };
  }
  return next;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
