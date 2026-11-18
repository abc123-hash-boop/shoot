import type { HudState } from '../game/Game';

const KIND_COLORS = ['#ff4a3a', '#b6ff3a', '#ffa500'];

function Crosshair({ hud }: { hud: HudState }) {
  const gap = 6 + hud.spread * 760;
  const len = 9;
  const base: React.CSSProperties = {
    position: 'absolute',
    background: '#fff',
    boxShadow: '0 0 2px #000, 0 0 4px rgba(0,0,0,.8)',
    opacity: 0.92,
  };
  const hitColor = hud.hitKind >= 2 ? '#ff2d2d' : hud.hitKind === 1 ? '#ffd23a' : '#ffffff';
  return (
    <>
      <div className="pointer-events-none absolute left-1/2 top-1/2" style={{ width: 0, height: 0 }}>
        <div style={{ ...base, left: -1, top: -(gap + len), width: 2, height: len }} />
        <div style={{ ...base, left: -1, top: gap, width: 2, height: len }} />
        <div style={{ ...base, top: -1, left: -(gap + len), width: len, height: 2 }} />
        <div style={{ ...base, top: -1, left: gap, width: len, height: 2 }} />
        <div style={{ ...base, left: -1, top: -1, width: 2, height: 2, borderRadius: 2 }} />
      </div>
      {hud.hitSeq > 0 && (
        <svg
          key={hud.hitSeq}
          className="anim-hit pointer-events-none absolute left-1/2 top-1/2"
          width="44"
          height="44"
          viewBox="0 0 44 44"
          style={{ filter: 'drop-shadow(0 0 3px rgba(0,0,0,.9))' }}
        >
          <g stroke={hitColor} strokeWidth={hud.hitKind >= 2 ? 3.5 : 2.5} strokeLinecap="round">
            <line x1="8" y1="8" x2="16" y2="16" />
            <line x1="36" y1="8" x2="28" y2="16" />
            <line x1="8" y1="36" x2="16" y2="28" />
            <line x1="36" y1="36" x2="28" y2="28" />
          </g>
        </svg>
      )}
    </>
  );
}

function Radar({ hud }: { hud: HudState }) {
  return (
    <div className="absolute right-5 top-5 h-36 w-36">
      <div className="relative h-full w-full overflow-hidden rounded-full border border-cyan-400/50 bg-slate-950/55 shadow-[0_0_20px_rgba(34,211,238,0.25)] backdrop-blur-sm">
        <div className="absolute inset-[25%] rounded-full border border-cyan-400/20" />
        <div className="absolute inset-[50%] rounded-full" />
        <div className="absolute left-1/2 top-0 h-full w-px bg-cyan-400/15" />
        <div className="absolute left-0 top-1/2 h-px w-full bg-cyan-400/15" />
        {hud.radar.map((d, i) => (
          <div
            key={i}
            className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${50 + d.x * 46}%`,
              top: `${50 + d.y * 46}%`,
              background: KIND_COLORS[d.k],
              boxShadow: `0 0 6px ${KIND_COLORS[d.k]}`,
              width: d.k === 2 ? 11 : 8,
              height: d.k === 2 ? 11 : 8,
            }}
          />
        ))}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: 0,
            height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderBottom: '11px solid #5ee7ff',
          }}
        />
      </div>
      <div className="mt-1 text-center text-[10px] font-bold tracking-[0.3em] text-cyan-300/70">RADAR</div>
    </div>
  );
}

export default function Hud({ hud }: { hud: HudState }) {
  const hpPct = Math.max(0, hud.hp);
  const hpColor = hpPct > 60 ? '#3dff7a' : hpPct > 30 ? '#ffd23a' : '#ff3b30';
  const low = hpPct <= 35;
  const vignette = Math.min(0.85, (1 - hpPct / 100) * 0.9);

  return (
    <div className="pointer-events-none absolute inset-0 select-none text-white">
      {/* low-health vignette */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 45%, rgba(190,0,0,0.9) 100%)',
          opacity: vignette,
          ...(low ? ({ animation: 'pulse-red 1.1s ease-in-out infinite', ['--lo' as string]: vignette * 0.6, ['--hi' as string]: vignette } as React.CSSProperties) : {}),
        }}
      />

      {/* damage flash + direction */}
      {hud.dmgSeq > 0 && (
        <div key={hud.dmgSeq} className="anim-dmg absolute inset-0">
          <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 140px 30px rgba(255,0,0,0.55)' }} />
          <div className="absolute left-1/2 top-1/2 h-0 w-0" style={{ transform: `rotate(${hud.dmgAngle}rad)` }}>
            <div
              className="absolute -translate-x-1/2"
              style={{
                top: -190,
                width: 150,
                height: 46,
                borderTop: '10px solid rgba(255,40,40,0.95)',
                borderRadius: '50% 50% 0 0 / 100% 100% 0 0',
                filter: 'drop-shadow(0 0 8px rgba(255,0,0,.9))',
              }}
            />
          </div>
        </div>
      )}

      <Crosshair hud={hud} />

      {/* reload */}
      {hud.reloading >= 0 && (
        <div className="absolute left-1/2 top-1/2 mt-16 -translate-x-1/2 text-center">
          <div className="hud-text mb-1 text-xs font-bold tracking-[0.35em] text-amber-300">换弹中</div>
          <div className="h-1.5 w-40 overflow-hidden rounded bg-black/50">
            <div className="h-full bg-amber-300" style={{ width: `${hud.reloading * 100}%` }} />
          </div>
        </div>
      )}
      {hud.reloading < 0 && hud.mag === 0 && hud.reserve === 0 && (
        <div className="hud-text absolute left-1/2 top-1/2 mt-16 -translate-x-1/2 text-sm font-bold tracking-widest text-red-400">弹药耗尽！</div>
      )}
      {hud.reloading < 0 && hud.mag <= Math.ceil(hud.magSize * 0.25) && hud.mag > 0 && hud.reserve > 0 && (
        <div className="hud-text absolute left-1/2 top-1/2 mt-16 -translate-x-1/2 text-sm font-bold tracking-widest text-amber-300">按 R 换弹</div>
      )}

      {/* top-left wave info */}
      <div className="absolute left-5 top-5">
        <div className="clip-corner border-l-4 border-cyan-400 bg-slate-950/60 px-4 py-2 backdrop-blur-sm">
          <div className="text-[10px] font-bold tracking-[0.35em] text-cyan-300/80">WAVE</div>
          <div className="hud-text text-3xl font-black leading-none">{hud.wave || '-'}</div>
          <div className="mt-1 text-xs font-semibold tracking-wider text-slate-300">
            剩余敌人 <span className="text-red-400">{hud.remaining}</span>
          </div>
        </div>
      </div>

      {/* top-center score */}
      <div className="absolute left-1/2 top-4 -translate-x-1/2 text-center">
        <div className="hud-text text-4xl font-black tabular-nums tracking-wider">{hud.score.toLocaleString()}</div>
        <div className="text-[11px] font-semibold tracking-[0.3em] text-slate-300/80">
          击杀 {hud.kills} · 爆头 {hud.headshots}
        </div>
      </div>

      <Radar hud={hud} />

      {/* banner */}
      {hud.bannerSeq > 0 && (
        <div key={hud.bannerSeq} className="anim-banner absolute left-1/2 top-[22%] -translate-x-1/2 text-center">
          <div className="hud-text whitespace-nowrap text-6xl font-black tracking-[0.2em] text-white" style={{ textShadow: '0 0 30px rgba(34,211,238,.8), 0 3px 0 #000' }}>
            {hud.banner}
          </div>
          <div className="hud-text mt-2 text-lg font-semibold tracking-[0.3em] text-cyan-200">{hud.bannerSub}</div>
        </div>
      )}

      {/* pickup toast */}
      {hud.pickupSeq > 0 && (
        <div key={hud.pickupSeq} className="anim-pickup hud-text absolute left-1/2 top-[62%] -translate-x-1/2 text-xl font-bold tracking-widest text-emerald-300">
          {hud.pickupText}
        </div>
      )}

      {/* health */}
      <div className="absolute bottom-6 left-6 w-72">
        <div className="clip-corner border-l-4 bg-slate-950/65 px-4 py-3 backdrop-blur-sm" style={{ borderColor: hpColor }}>
          <div className="flex items-end justify-between">
            <span className="text-[10px] font-bold tracking-[0.35em] text-slate-300">HEALTH</span>
            <span className="hud-text text-4xl font-black leading-none tabular-nums" style={{ color: hpColor }}>{hpPct}</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-sm bg-black/60">
            <div className="h-full transition-[width] duration-150" style={{ width: `${hpPct}%`, background: hpColor, boxShadow: `0 0 10px ${hpColor}` }} />
          </div>
        </div>
      </div>

      {/* ammo */}
      <div className="absolute bottom-6 right-6 w-72">
        <div className="mb-2 flex justify-end gap-2">
          {['突击步枪', '霰弹枪'].map((n, i) => (
            <div
              key={n}
              className={`clip-corner px-3 py-1 text-xs font-bold tracking-wider ${hud.weapon === i ? 'bg-cyan-400 text-slate-900' : 'bg-slate-950/60 text-slate-400'}`}
            >
              {i + 1} {n}
            </div>
          ))}
        </div>
        <div className="clip-corner border-r-4 border-amber-400 bg-slate-950/65 px-4 py-3 text-right backdrop-blur-sm">
          <div className="text-[10px] font-bold tracking-[0.35em] text-slate-300">{hud.weaponName}</div>
          <div className="flex items-end justify-end gap-2">
            <span className={`hud-text text-5xl font-black leading-none tabular-nums ${hud.mag === 0 ? 'text-red-400' : 'text-white'}`}>{hud.mag}</span>
            <span className="pb-1 text-xl font-bold text-slate-400 tabular-nums">/ {hud.reserve}</span>
          </div>
          <div className="mt-2 flex justify-end gap-[2px]">
            {Array.from({ length: hud.magSize }).map((_, i) => (
              <div
                key={i}
                className="h-3 rounded-[1px]"
                style={{ width: hud.magSize > 10 ? 4 : 12, background: i < hud.mag ? '#ffc933' : 'rgba(255,255,255,0.12)' }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
