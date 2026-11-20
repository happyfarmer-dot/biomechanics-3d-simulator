import { Compass, RotateCcw } from 'lucide-react';
import { useRef } from 'react';
import { SKELETON_CONFIG } from '../../data/skeletonConfig';
import { useSimStore } from '../../store/useSimStore';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function JointTouchPad() {
  const useTouchPad = useSimStore((s) => s.useTouchPad);
  const selectedJoint = useSimStore((s) => s.selectedJoint);
  const interactionMode = useSimStore((s) => s.interactionMode);
  const pose = useSimStore((s) => s.pose);
  const jointRiskMap = useSimStore((s) => s.jointRiskMap);
  const setJointAngles = useSimStore((s) => s.setJointAngles);

  const dragStartRef = useRef<{
    x: number;
    y: number;
    flexion: number;
    abduction: number;
  } | null>(null);

  if (!useTouchPad || !selectedJoint || interactionMode !== 'pose') return null;

  const cfg = SKELETON_CONFIG[selectedJoint];
  const angles = pose[selectedJoint];
  const risk = jointRiskMap[selectedJoint];

  const [flexMin, flexMax] = cfg.romLimits.flexion;
  const [abdMin, abdMax] = cfg.romLimits.abduction;
  const [rotMin, rotMax] = cfg.romLimits.rotation;

  const flexOut = angles.flexion < flexMin || angles.flexion > flexMax;
  const abdOut = angles.abduction < abdMin || angles.abduction > abdMax;
  const rotOut = angles.rotation < rotMin || angles.rotation > rotMax;

  // Normalized dot position inside 96x96 pad
  const dotX = clamp(((angles.abduction + 60) / 240) * 100, 6, 94);
  const dotY = clamp((1 - (angles.flexion + 90) / 270) * 100, 6, 94);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      flexion: angles.flexion,
      abduction: angles.abduction,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    e.stopPropagation();
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    const nextFlex = clamp(
      Math.round((dragStartRef.current.flexion - dy * 1.35) * 10) / 10,
      -90,
      180
    );
    const nextAbd = clamp(
      Math.round((dragStartRef.current.abduction + dx * 1.35) * 10) / 10,
      -60,
      180
    );
    setJointAngles(selectedJoint, { flexion: nextFlex, abduction: nextAbd });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    e.stopPropagation();
    dragStartRef.current = null;
  };

  const safetyRatio =
    risk === 'critical' ? 100 : risk === 'warning' ? 75 : 32;
  const barColor =
    risk === 'critical'
      ? 'bg-red-500'
      : risk === 'warning'
      ? 'bg-amber-400'
      : 'bg-emerald-400';

  return (
    <div
      data-testid="joint-touch-pad"
      className="pointer-events-auto absolute right-3 bottom-14 md:bottom-16 z-20 rounded-xl border border-slate-700/80 bg-slate-950/88 p-2.5 shadow-2xl backdrop-blur-md space-y-2"
    >
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="flex items-center gap-1 font-semibold text-sky-200">
          <Compass className="h-3.5 w-3.5 text-sky-400" />
          {cfg.nameZh}
        </span>
        <button
          type="button"
          onClick={() =>
            setJointAngles(selectedJoint, { flexion: 0, abduction: 0, rotation: 0 })
          }
          title="歸零"
          className="text-slate-400 hover:text-sky-300 cursor-pointer"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      </div>

      <div className="flex items-center gap-2.5">
        {/* 96x96 2D 雙軸觸控方框 */}
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="relative h-24 w-24 touch-none rounded-lg border border-slate-700 bg-slate-900/90 cursor-crosshair overflow-hidden"
        >
          {/* Crosshair lines */}
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-slate-700/60" />
          <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-slate-700/60" />
          <span className="pointer-events-none absolute top-0.5 left-1 text-[8px] text-slate-500">
            屈曲
          </span>
          <span className="pointer-events-none absolute bottom-0.5 right-1 text-[8px] text-slate-500">
            外展
          </span>
          {/* Live Position Dot */}
          <div
            style={{ left: `${dotX}%`, top: `${dotY}%` }}
            className={`pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow ${
              flexOut || abdOut
                ? 'border-red-200 bg-red-500'
                : 'border-sky-100 bg-sky-400'
            }`}
          />
        </div>

        {/* 內旋 / 外旋 垂直弧形滑條 */}
        <div className="flex flex-col items-center justify-between h-24">
          <span className="text-[9px] text-slate-400">旋轉</span>
          <input
            type="range"
            min={-100}
            max={100}
            step={1}
            value={angles.rotation}
            onChange={(e) =>
              setJointAngles(selectedJoint, { rotation: Number(e.target.value) })
            }
            aria-label="軸向旋轉"
            style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
            className="h-16 w-4 accent-sky-500 cursor-pointer"
          />
          <span
            className={`font-mono text-[9px] ${
              rotOut ? 'text-red-400' : 'text-sky-300'
            }`}
          >
            {angles.rotation.toFixed(0)}°
          </span>
        </div>
      </div>

      {/* 即時角度與安全進度條 */}
      <div className="space-y-1">
        <div className="flex justify-between font-mono text-[9px] text-slate-300">
          <span className={flexOut ? 'text-red-400' : ''}>
            屈 {angles.flexion.toFixed(0)}°
          </span>
          <span className={abdOut ? 'text-red-400' : ''}>
            展 {angles.abduction.toFixed(0)}°
          </span>
          <span className={rotOut ? 'text-red-400' : ''}>
            旋 {angles.rotation.toFixed(0)}°
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            style={{ width: `${safetyRatio}%` }}
            className={`h-full transition-all ${barColor}`}
          />
        </div>
      </div>
    </div>
  );
}
