import React, { useEffect, useMemo, useRef, useState } from "react";

// ------------------------------------------------------------
// HIV Memory T-cell Game — Simple Visual (v0.2 + stopwatch/slower spread)
// ------------------------------------------------------------

const STATUS = {
  HEALTHY: "HEALTHY",
  LATENT: "LATENT",
  ACTIVE: "ACTIVE",
  DEAD: "DEAD",
};

export default function HIVMemoryTCellGame() {
  const [running, setRunning] = useState(false);
  const [artOn, setArtOn] = useState(false); // default ART OFF (toggle ON to suppress spread)
  const [showPathogenFX, setShowPathogenFX] = useState(false);

  // Stopwatch (count-up) + infection accumulator (drives ART-OFF infections)
  const [elapsedMs, setElapsedMs] = useState(0);
  const infectAccumRef = useRef(0);

  function formatTime(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, "0");
    return `${m}:${ss}`;
  }

  // Bigger playfield
  const worldW = 960; // px
  const worldH = 600; // px

  // Build a large field of memory T-cells
  const cellCount = 1000;
  const initial = useMemo(() => placeCells(cellCount, worldW, worldH), []);
  const [cells, setCells] = useState(initial);

  // Start with 100 free virions
  const [virions, setVirions] = useState(() => spawnVirions(100, worldW, worldH));
  const [tick, setTick] = useState(0);

  // Main loop (~320ms)
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setTick(t => t + 1);
      setElapsedMs(ms => ms + 320);

      // Fill accumulator continuously; infections only fire when ART is OFF
      infectAccumRef.current += 320;

      // 1) Virions drift
      setVirions(vs => moveVirions(vs, worldW, worldH));

      // 2) Producer shedding disabled: free virus changes only via +50 and Flush
      setVirions(vs => vs);

      // 3) ART OFF → infections happen in batches every 2 seconds:
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
              const latent = Math.random() < 0.6; // mix of latent vs active
              next[idx] = { ...c, s: latent ? STATUS.LATENT : STATUS.ACTIVE };
            }
            return next;
          });
        }
      }

      // 4) ART ON → block all new infections (no entry, no replication)
      // (intentionally no infection logic when ART is ON)

      // 5) Free virus decay only when ART is ON; stays constant when ART is OFF
      setVirions(vs => (artOn ? vs.filter((_, i) => i % 25 !== 0) : vs));

      // 6) Some active cells die naturally (very simplified)
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

    // Reactivate latent cells → active producers (educational blip)
    setCells(prev => prev.map(c => (c.s === STATUS.LATENT ? { ...c, s: STATUS.ACTIVE } : c)));

    // Immediate boost only if ART is OFF
    setVirions(vs => artOn ? vs : vs.concat(spawnVirions(Math.min(60, latent * 2), worldW, worldH, true, cells)));
  }

  // Manually introduce more free HIV virions
  function addVirions(n = 10) {
    setVirions(vs => vs.concat(spawnVirions(n, worldW, worldH)));
  }

  function reset() {
    setCells(placeCells(cellCount, worldW, worldH));
    setVirions(spawnVirions(100, worldW, worldH)); // keep 100 on reset too
    setShowPathogenFX(false);
    setTick(0);
    setElapsedMs(0);                // stopwatch back to 0
    infectAccumRef.current = 0;
    setArtOn(false);                // default back to ART OFF
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

              {/* Cells */}
              {cells.map((c, i) => (
                <g key={i}>
                  {c.s === STATUS.HEALTHY && <circle cx={c.x} cy={c.y} r={c.r} className="fill-emerald-500" />}
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
            <LegendDot cls="bg-yellow-300 ring-2 ring-yellow-300" label="Latent (quiet)" ring />
            <LegendDot cls="bg-red-500" label="Active (making HIV)" />
            <LegendDot cls="bg-fuchsia-400" label="HIV virion" small />
          </div>
        </div>

        {/* Controls + Story */}
        <div className="rounded-3xl p-4 bg-zinc-900 shadow-inner flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Play</h2>

          {/* Control buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setArtOn(v => !v)}
              className={`px-3 py-2 rounded-2xl ${artOn ? "bg-indigo-500" : "bg-indigo-700"}`}
            >
              {artOn ? "ART: ON (blocks new infections)" : "ART: OFF"}
            </button>
            <button onClick={flushVirus} className="px-3 py-2 rounded-2xl bg-purple-800">Flush Free Virus</button>
            <button onClick={() => addVirions(50)} className="px-3 py-2 rounded-2xl bg-pink-600">+50 Virions</button>
            <button onClick={introducePathogen} className="px-3 py-2 rounded-2xl bg-rose-700">Introduce Pathogen</button>
          </div>

          {/* Live metrics */}
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <Metric label="Healthy" value={healthy} />
            <Metric label="Latent reservoir" value={latent} />
            <Metric label="Active infected" value={active} />
            <Metric label="Free virus (viral load)" value={virions.length} />
          </div>

          {/* Instructions & activity */}
          <div className="mt-3 text-sm text-zinc-200 space-y-3">
            <p className="text-[12px] text-zinc-300">
              <strong>What “+50 Virions” means:</strong> Adds 50 free virus particles. This simulates either (a) infected
              memory T-cells releasing virus, or (b) new exposure entering the body (e.g., sharing needles with an infected
              person or sexual transmission).
            </p>

            <div className="space-y-1">
              <p className="font-semibold">Group 1</p>
              <p>
                <strong>Try this:</strong> Make sure <em>ART is OFF</em> → <em>Start Run</em> → after <em>10 seconds</em>, hit
                <em> Flush Free Virus</em> → after <em>2 seconds</em> <em>Introduce Pathogen</em>.
              </p>
              <ul className="list-disc ml-5">
                <li>How many <strong>Healthy</strong> cells are there?</li>
                <li>What is the <strong>viral load / viral count</strong>?</li>
              </ul>
            </div>

            <div className="space-y-1">
              <p className="font-semibold">Group 2</p>
              <p>
                <strong>Try this:</strong> <em>Start Run</em> → turn <em>ART OFF</em> → hit <em>Flush Free Virus</em> → now
                <em> Introduce Pathogen</em>.
              </p>
            </div>

            <p className="text-[11px] text-zinc-400 leading-snug">
              This schematic visualization is not drawn to anatomical scale. Cell sizes, counts, and timing; including infection
              frequency are intentionally simplified for educational purposes and do not represent clinical infection rates,
              transmission probabilities, or treatment performance.
            </p>
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
  // For big n, use a jittered grid so it renders smoothly.
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

  // small-n fallback: random non-overlapping
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







