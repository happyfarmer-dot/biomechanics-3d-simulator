import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ACTION_TRAJECTORIES, interpolatePoseSlerp } from '../../data/actionTrajectories';
import { useSimStore } from '../../store/useSimStore';

export function ActionScrubber() {
  const activePresetId = useSimStore((s) => s.activePresetId);
  const trajectory = activePresetId ? ACTION_TRAJECTORIES[activePresetId] : undefined;

  const [progress, setProgress] = useState(1);
  const [playing, setPlaying] = useState(false);
  const progressRef = useRef(1);
  const dirRef = useRef(-1);

  useEffect(() => {
    progressRef.current = 1;
    dirRef.current = -1;
    setProgress(1);
    setPlaying(false);
  }, [activePresetId]);

  useEffect(() => {
    if (!playing || !trajectory) return;
    let rafId = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      let next = progressRef.current + dirRef.current * dt * 0.45;
      if (next >= 1) {
        next = 1;
        dirRef.current = -1;
      } else if (next <= 0) {
        next = 0;
        dirRef.current = 1;
      }
      progressRef.current = next;
      setProgress(next);
      const pose = interpolatePoseSlerp(trajectory.keyframes, next);
      useSimStore.getState().setPose(pose, true);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playing, trajectory]);

  if (!trajectory) return null;

  const currentStage =
    trajectory.keyframes.reduce((best, kf) =>
      Math.abs(kf.t - progress) < Math.abs(best.t - progress) ? kf : best
    )?.label ?? '';

  return (
    <div
      data-testid="action-scrubber"
      className="pointer-events-auto absolute bottom-14 md:bottom-4 left-1/2 z-20 flex w-[92%] max-w-md -translate-x-1/2 items-center gap-2.5 rounded-xl border border-slate-700/80 bg-slate-950/90 px-3 py-2 shadow-2xl backdrop-blur-md"
    >
      <button
        type="button"
        data-testid="action-scrubber-play"
        onClick={() => setPlaying((p) => !p)}
        aria-label={playing ? '暫停' : '播放'}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-sky-500/40 bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 cursor-pointer"
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-semibold text-slate-200 truncate">{trajectory.title}</span>
          <span className="font-mono text-sky-300">
            {currentStage} · {Math.round(progress * 100)}%
          </span>
        </div>
        <input
          type="range"
          data-testid="action-scrubber-slider"
          min={0}
          max={100}
          step={1}
          value={Math.round(progress * 100)}
          onChange={(e) => {
            setPlaying(false);
            const t = Number(e.target.value) / 100;
            progressRef.current = t;
            dirRef.current = t >= 1 ? -1 : 1;
            setProgress(t);
            const pose = interpolatePoseSlerp(trajectory.keyframes, t);
            useSimStore.getState().setPose(pose, true);
          }}
          className="h-1.5 w-full accent-sky-400 cursor-pointer"
        />
      </div>
    </div>
  );
}
