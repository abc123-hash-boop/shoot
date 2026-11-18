import { useEffect, useRef, useState } from 'react';
import { Game, INITIAL_HUD, type HudState, type Phase } from './game/Game';
import Hud from './components/Hud';
import Overlay from './components/Overlay';

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [phase, setPhase] = useState<Phase>('menu');
  const [hud, setHud] = useState<HudState>(INITIAL_HUD);

  useEffect(() => {
    const g = new Game(mountRef.current!, { onHud: setHud, onPhase: setPhase });
    gameRef.current = g;
    return () => {
      g.dispose();
      gameRef.current = null;
    };
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black" style={{ cursor: phase === 'playing' ? 'none' : 'default' }}>
      <div ref={mountRef} className="absolute inset-0" />
      {(phase === 'playing' || phase === 'paused') && <Hud hud={hud} />}
      <Overlay
        phase={phase}
        hud={hud}
        onStart={() => gameRef.current?.start()}
        onResume={() => gameRef.current?.resume()}
        onMenu={() => gameRef.current?.toMenu()}
      />
    </div>
  );
}
