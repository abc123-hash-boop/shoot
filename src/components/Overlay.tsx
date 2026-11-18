import type { HudState, Phase } from '../game/Game';

const CONTROLS: [string, string][] = [
  ['W A S D', '移动'],
  ['鼠标', '瞄准'],
  ['左键', '射击'],
  ['R', '换弹'],
  ['Shift', '冲刺'],
  ['空格', '跳跃'],
  ['1 / 2 / 滚轮', '切换武器'],
  ['Esc / P', '暂停'],
];

function Controls() {
  return (
    <div className="mx-auto mt-6 grid max-w-xl grid-cols-2 gap-x-8 gap-y-2 text-left">
      {CONTROLS.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-3 border-b border-white/10 pb-1">
          <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-xs font-bold text-cyan-200">{k}</span>
          <span className="text-sm text-slate-300">{v}</span>
        </div>
      ))}
    </div>
  );
}

function Btn({ onClick, children, primary = true }: { onClick: () => void; children: React.ReactNode; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`clip-corner pointer-events-auto px-10 py-3 text-lg font-black tracking-[0.3em] transition hover:scale-105 active:scale-95 ${
        primary
          ? 'bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 shadow-[0_0_30px_rgba(34,211,238,0.5)]'
          : 'bg-white/10 text-white hover:bg-white/20'
      }`}
    >
      {children}
    </button>
  );
}

export default function Overlay({
  phase, hud, onStart, onResume, onMenu,
}: {
  phase: Phase;
  hud: HudState;
  onStart: () => void;
  onResume: () => void;
  onMenu: () => void;
}) {
  if (phase === 'playing') return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-black/60 via-slate-950/55 to-black/75 backdrop-blur-[2px]">
      <div className="w-full max-w-2xl px-6 text-center text-white">
        {phase === 'menu' && (
          <>
            <div className="text-xs font-bold tracking-[0.6em] text-cyan-300/80">FIRST PERSON SHOOTER</div>
            <h1
              className="anim-flicker mt-2 text-6xl font-black italic tracking-wider md:text-7xl"
              style={{ textShadow: '0 0 40px rgba(34,211,238,.55), 0 4px 0 #0a1a2a' }}
            >
              ARENA <span className="text-cyan-300">STRIKE</span>
            </h1>
            <p className="mt-2 text-xl font-semibold tracking-[0.5em] text-slate-300">竞技场突击</p>
            <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-slate-300/90">
              机器人军团正在涌入竞技场。击退一波又一波的敌人，爆头得分更高，拾取掉落的弹药和医疗包，活到最后。
            </p>
            <div className="mt-7"><Btn onClick={onStart}>开始战斗</Btn></div>
            <Controls />
            <div className="mt-6 flex justify-center gap-6 text-xs text-slate-300">
              <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#ff4a3a]" />步兵：远程射击</span>
              <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#b6ff3a]" />猎手：高速近战</span>
              <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#ffa500]" />重甲：三连发</span>
            </div>
            {hud.best > 0 && <div className="mt-4 text-sm font-bold tracking-widest text-amber-300">最高分 {hud.best.toLocaleString()}</div>}
          </>
        )}

        {phase === 'paused' && (
          <>
            <h2 className="text-5xl font-black tracking-[0.4em]">已暂停</h2>
            <div className="mt-6 flex justify-center gap-4">
              <Btn onClick={onResume}>继续</Btn>
              <Btn onClick={onMenu} primary={false}>主菜单</Btn>
            </div>
            <Controls />
            <p className="mt-4 text-xs text-slate-400">如果鼠标没有被锁定，请点击游戏画面；也可以使用方向键转动视角。</p>
          </>
        )}

        {phase === 'over' && (
          <>
            <div className="text-xs font-bold tracking-[0.6em] text-red-400">MISSION FAILED</div>
            <h2 className="mt-2 text-6xl font-black tracking-[0.3em] text-red-500" style={{ textShadow: '0 0 30px rgba(255,0,0,.5)' }}>
              你阵亡了
            </h2>
            <div className="mx-auto mt-8 grid max-w-md grid-cols-2 gap-3">
              {[
                ['得分', hud.score.toLocaleString()],
                ['最高分', Math.max(hud.best, hud.score).toLocaleString()],
                ['到达波次', String(hud.wave)],
                ['击杀', String(hud.kills)],
                ['爆头', String(hud.headshots)],
                ['命中率', `${hud.accuracy}%`],
              ].map(([k, v]) => (
                <div key={k} className="clip-corner border-l-2 border-red-400/70 bg-white/5 px-4 py-3 text-left">
                  <div className="text-[11px] font-bold tracking-[0.3em] text-slate-400">{k}</div>
                  <div className="text-2xl font-black tabular-nums">{v}</div>
                </div>
              ))}
            </div>
            {hud.score >= hud.best && hud.score > 0 && (
              <div className="mt-4 text-sm font-bold tracking-[0.4em] text-amber-300">★ 新纪录 ★</div>
            )}
            <div className="mt-8 flex justify-center gap-4">
              <Btn onClick={onStart}>再来一局</Btn>
              <Btn onClick={onMenu} primary={false}>主菜单</Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
