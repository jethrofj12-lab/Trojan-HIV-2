import React, { useEffect, useMemo, useState } from "react";

// ------------------------------------------------------------
// HIV Memory T‑cell Game — Simple Visual (v0.2)
// ------------------------------------------------------------
// Audience: general public (no science background)
// Visual model:
//  • Large green circles = healthy memory CD4+ T‑cells
//  • Yellow rings = latently infected memory T‑cells (quiet, infected)
//  • Red circles (pulsing) = actively producing HIV
//  • Small pink dots = free HIV virions
//  • Purple star burst appears when a new pathogen is introduced (memory activation)
// Controls:
//  • Run/Pause, ART On/Off, Flush Virus, Introduce Pathogen
// Key idea:
//  Even if free virus is flushed (undetectable), yellow latent cells remain and
//  can wake up on a new infection (pathogen) → red producers → viral “blip.”
// ------------------------------------------------------------

const STATUS = {
  HEALTHY: "HEALTHY",
  LATENT: "LATENT",
  ACTIVE: "ACTIVE",
  DEAD: "DEAD",
};

export default function HIVMemoryTCellGame() {
  // Tuned for a calm visual experience
  const [running, setRunning] = useState(false);
  const [artOn, setArtOn] = useState(true); // default ART ON for teaching U=U context
  const [showPathogenFX, setShowPathogenFX] = useState(false);

  const worldW = 680; // px
  const worldH = 440; // px

  // Build a small field of memory T‑cells laid out randomly but non‑overlapping
  const cellCount = 36;
  const initial = useMemo(() => placeCells(cellCount, worldW, worldH), []);
  const [cells, setCells] = useState(initial);

  const [virions, setVirions] = useState(() => spawnVirions(30, worldW, worldH));
  const [tick, setTick] = useState(0);

  // Simple loop
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setTick(t => t + 1);

      // 1) Virions drift
      setVirions(vs => moveVirions(vs, worldW, worldH));

      // 2) Active cells shed virus (suppressed by ART)
      setVirions(vs => {
        const activeCount = cells.filter(c => c.s === STATUS.ACTIVE).length;
        const produced = artOn ? 0 : Math.min(40, Math.floor(activeCount * 1.5));
        return produced > 0 ? vs.concat(spawnVirions(produced, worldW, worldH, /*centerBias=*/true, cells)) : vs;
      });

      // 3) Infection checks: virions near healthy cells may infect (ART reduces chance)
      setCells(prev => {
        const next = [...prev];
        const baseProb = 0.22; // simple, readable dynamics
        const prob = artOn ? baseProb * 0.08 : baseProb; // ART dramatically lowers entry
        for (let v of virions) {
          for (let i = 0; i < next.length; i++) {
            const c = next[i];
            if (c.s !== STATUS.HEALTHY) continue;
            if (dist(c.x, c.y, v.x, v.y) < c.r + 4) {
              if (Math.random() < prob) {
                const latent = Math.random() < 0.6; // most infections seed latent reservoir
                next[i] = { ...c, s: latent ? STATUS.LATENT : STATUS.ACTIVE };
              }
            }
          }
        }
        return next;
      });

      // 4) Gentle decay of free virus
      setVirions(vs => vs.filter((_, i) => i % 25 !== 0)); // drop ~4% each tick

      // 5) Some active cells die naturally (very simplified)
      setCells(prev => prev.map(c => (c.s === STATUS.ACTIVE && Math.random() < 0.002) ? { ...c, s: STATUS.DEAD } : c));
    }, 320);
    return () => clearInterval(id);
  }, [running, artOn, cells, virions]);

  // Derived counts
  const healthy = cells.filter(c => c.s === STATUS.HEALTHY).length;
  const latent = cells.filter(c => c.s === STATUS.LATENT).length;
  const active = cells.filter(c => c.s === STATUS.ACTIVE).length;

  // Actions
  function flushVirus() {
    setVirions([]);
  }

  function introducePathogen() {
    // Flash FX
    setShowPathogenFX(true);
    setTimeout(() => setShowPathogenFX(false), 800);

    // Activate a chunk of memory population
    setCells(prev => prev.map(c => {
      if (c.s === STATUS.LATENT) {
        // Reactivation of latent cells → active producers
        return { ...c, s: STATUS.ACTIVE };
      }
      return c;
    }));

    // Small immediate boost in virions from newly reactivated cells (unless ART ON)
    setVirions(vs => artOn ? vs : vs.concat(spawnVirions(Math.min(60, latent * 2), worldW, worldH, true, cells)));
  }

  // Manually introduce more free HIV virions
  function addVirions(n = 10) {
    setVirions(vs => vs.concat(spawnVirions(n, worldW, worldH)));
  }


  function reset() {
    setCells(placeCells(cellCount, worldW, worldH));
    setVirions(spawnVirions(30, worldW, worldH));
    setShowPathogenFX(false);
    setTick(0);
    setArtOn(true);
    setRunning(false);
  }

  return (
    <div className="w-full min-h-screen bg-zinc-950 text-zinc-100 p-6 flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-semibold">HIV & Memory T‑cells — Simple Visual</h1>
        <div className="flex items-center gap-2">
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

              {/* Cells */}
              {cells.map((c, i) => (
                <g key={i}>
                  {c.s === STATUS.HEALTHY && (
                    <circle cx={c.x} cy={c.y} r={c.r} className="fill-emerald-500" />
                  )}
                  {c.s === STATUS.LATENT && (
                    <>
                      <circle cx={c.x} cy={c.y} r={c.r-3} className="fill-zinc-900" />
                      <circle cx={c.x} cy={c.y} r={c.r} className="fill-yellow-300" />
                      <circle cx={c.x} cy={c.y} r={c.r-6} className="fill-zinc-900" />
                    </>
                  )}
                  {c.s === STATUS.ACTIVE && (
                    <circle cx={c.x} cy={c.y} r={c.r} className="fill-red-500">
                      <animate attributeName="r" values={`${c.r};${c.r+2};${c.r}`} dur="0.9s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {c.s === STATUS.DEAD && (
                    <circle cx={c.x} cy={c.y} r={c.r} className="fill-zinc-600" />
                  )}
                </g>
              ))}

              {/* Virions */}
              {virions.map((v, i) => (
                <circle key={i} cx={v.x} cy={v.y} r={3} className="fill-fuchsia-400" />
              ))}
            </svg>
          </div>
          <div className="flex flex-wrap gap-3 mt-3 text-xs text-zinc-300">
            <LegendDot cls="bg-emerald-500" label="Healthy memory T‑cell" />
            <LegendDot cls="bg-yellow-300 ring-2 ring-yellow-300" label="Latent (quiet)" ring />
            <LegendDot cls="bg-red-500" label="Active (making HIV)" />
            <LegendDot cls="bg-fuchsia-400" label="HIV virion" small />
          </div>
        </div>

        {/* Controls + Story */}
        <div className="rounded-3xl p-4 bg-zinc-900 shadow-inner flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Play</h2>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setArtOn(v => !v)} className={`px-3 py-2 rounded-2xl ${artOn ? "bg-indigo-500" : "bg-indigo-700"}`}>{artOn ? "ART: ON (suppresses spread)" : "ART: OFF"}</button>
            <button onClick={flushVirus} className="px-3 py-2 rounded-2xl bg-purple-800">Flush Free Virus</button>
            <button onClick={() => addVirions(10)} className="px-3 py-2 rounded-2xl bg-pink-600">+10 Virions</button>
            <button onClick={introducePathogen} className="px-3 py-2 rounded-2xl bg-rose-700">Introduce Pathogen</button>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <Metric label="Healthy" value={healthy} />
            <Metric label="Latent reservoir" value={latent} />
            <Metric label="Active infected" value={active} />
            <Metric label="Free virus" value={virions.length} />
          </div>

          <div className="mt-3 text-sm text-zinc-200 space-y-2">
            <p><strong>Idea:</strong> HIV can hide in memory T‑cells (yellow). ART blocks most new spread but doesn’t remove hidden cells.</p>
            <p><strong>Try this:</strong> Start <em>Run</em> → hit <em>Flush Free Virus</em> → keep <em>ART ON</em> → now <em>Introduce Pathogen</em>. Latent cells wake up and make HIV (red), even though blood virus was undetectable.</p>
          </div>
        </div>
      </section>

      <footer className="text-[11px] text-zinc-500">v0.2 • Educational demo. Not medical advice.</footer>
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
  const cells = [];
  let tries = 0;
  while (cells.length < n && tries < 5000) {
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
