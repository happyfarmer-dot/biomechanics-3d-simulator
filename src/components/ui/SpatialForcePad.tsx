import { ArrowLeftRight, ArrowUpRight, Plus } from 'lucide-react';
import { useRef } from 'react';
import { ACTION_TRAJECTORIES } from '../../data/actionTrajectories';
import { GRAVITY_MPS2, SKELETON_CONFIG } from '../../data/skeletonConfig';
import { getForceMagnitudeN } from '../../engine/staticsEngine';
import { useSimStore } from '../../store/useSimStore';
import type { Vec3 } from '../../types/biomechanics';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function sphericalToVec3(magN: number, azimuthDeg: number, elevationDeg: number): Vec3 {
  const el = elevationDeg * DEG2RAD;
  const az = azimuthDeg * DEG2RAD;
  const h = magN * Math.cos(el);
  return [
    Math.round(h * Math.sin(az) * 10) / 10,
    Math.round(magN * Math.sin(el) * 10) / 10,
    Math.round(h * Math.cos(az) * 10) / 10,
  ];
}

function vec3ToSpherical(v: Vec3): { magN: number; azimuthDeg: number; elevationDeg: number } {
  const magN = Math.hypot(v[0], v[1], v[2]);
  if (magN < 1e-4) return { magN: 0, azimuthDeg: 0, elevationDeg: 0 };
  const elevationDeg = Math.asin(clamp(v[1] / magN, -1, 1)) * RAD2DEG;
  const azimuthDeg = Math.atan2(v[0], v[2]) * RAD2DEG;
  return { magN, azimuthDeg, elevationDeg };
}

export function SpatialForcePad() {
  const interactionMode = useSimStore((s) => s.interactionMode);
  const activePresetId = useSimStore((s) => s.activePresetId);
  const forces = useSimStore((s) => s.forces);
  const selectedForceId = useSimStore((s) => s.selectedForceId);
  const selectedJoint = useSimStore((s) => s.selectedJoint) ?? 'knee_R';
  const addForce = useSimStore((s) => s.addForce);
  const updateForce = useSimStore((s) => s.updateForce);
  const invertForce = useSimStore((s) => s.invertForce);

  const dragRef = useRef<{
    x: number;
    y: number;
    az: number;
    el: number;
    magN: number;
  } | null>(null);

  if (interactionMode !== 'force') return null;

  const hasActionScrubber = Boolean(activePresetId && ACTION_TRAJECTORIES[activePresetId]);
  const bottomPosClass = hasActionScrubber
    ? 'bottom-[120px] md:bottom-20'
    : 'bottom-14 md:bottom-16';

  const activeForce =
    forces.find((f) => f.id === selectedForceId) ?? forces[0] ?? null;

  if (!activeForce) {
    return (
      <div
        data-testid="spatial-force-pad"
        className={`pointer-events-auto absolute right-3 ${bottomPosClass} z-20 w-56 rounded-xl border border-red-500/40 bg-slate-950/90 p-3 shadow-2xl backdrop-blur-md space-y-2 text-xs`}
      >
        <div className="font-semibold text-red-200 flex items-center gap-1.5">
          <ArrowUpRight className="h-3.5 w-3.5 text-red-400" />
          空間施力操控盤
        </div>
        <p className="text-[11px] text-slate-400 leading-snug">
          點擊人體任何骨骼或肌肉表面即可直接放置施力點，或點下方按鈕快速建立：
        </p>
        <button
          type="button"
          onClick={() =>
            addForce({
              targetJoint: selectedJoint,
              positionRatio: 0.75,
              surfaceAngleDeg: -90,
              forceVectorWorld: [245.2, 0, 0],
              scaleNpm: 1000,
              label: '外側推力',
            })
          }
          className="flex w-full items-center justify-center gap-1 rounded-lg border border-red-500/50 bg-red-500/20 py-1.5 font-medium text-red-100 hover:bg-red-500/30 cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          在 {SKELETON_CONFIG[selectedJoint].nameZh} 建立施力
        </button>
      </div>
    );
  }

  const { magN, azimuthDeg, elevationDeg } = vec3ToSpherical(activeForce.forceVectorWorld);
  const magKgf = magN / GRAVITY_MPS2;
  const isLeftLimb = activeForce.targetJoint.endsWith('_L');

  // Clinical direction presets (aware of L/R side for lateral/medial!)
  const applyClinicalPreset = (type: 'lat_to_med' | 'med_to_lat' | 'ant_to_post' | 'post_to_ant' | 'down') => {
    const fMag = Math.max(magN, 196.2); // at least 20 kgf if currently 0
    let vec: Vec3 = [0, -fMag, 0];
    let surfAngle = activeForce.surfaceAngleDeg ?? 0;

    if (type === 'lat_to_med') {
      // Push from lateral toward medial (+X for R limb, -X for L limb)
      vec = [isLeftLimb ? -fMag : fMag, 0, 0];
      surfAngle = isLeftLimb ? 90 : -90;
    } else if (type === 'med_to_lat') {
      // Push from medial toward lateral (-X for R limb, +X for L limb)
      vec = [isLeftLimb ? fMag : -fMag, 0, 0];
      surfAngle = isLeftLimb ? -90 : 90;
    } else if (type === 'ant_to_post') {
      vec = [0, 0, -fMag];
      surfAngle = 0;
    } else if (type === 'post_to_ant') {
      vec = [0, 0, fMag];
      surfAngle = 180;
    } else if (type === 'down') {
      vec = [0, -fMag, 0];
      surfAngle = 0;
    }

    updateForce(activeForce.id, {
      forceVectorWorld: vec,
      surfaceAngleDeg: surfAngle,
    });
  };

  const dotX = clamp(((azimuthDeg + 180) / 360) * 100, 8, 92);
  const dotY = clamp((1 - (elevationDeg + 90) / 180) * 100, 8, 92);

  return (
    <div
      data-testid="spatial-force-pad"
      className={`pointer-events-auto absolute right-3 ${bottomPosClass} z-20 w-[238px] rounded-xl border border-red-500/40 bg-slate-950/90 p-2.5 shadow-2xl backdrop-blur-md space-y-2`}
    >
      <div className="flex items-center justify-between gap-1 text-[11px]">
        <span className="font-semibold text-red-200 truncate">
          施力：{SKELETON_CONFIG[activeForce.targetJoint].nameZh}
        </span>
        <button
          type="button"
          onClick={() => invertForce(activeForce.id)}
          className="flex shrink-0 items-center gap-0.5 rounded border border-amber-500/40 bg-amber-950/50 px-1.5 py-0.5 text-[10px] text-amber-200 hover:bg-amber-900/60 cursor-pointer"
        >
          <ArrowLeftRight className="h-2.5 w-2.5" />
          推/拉反轉
        </button>
      </div>

      {/* 5 顆一鍵臨床施力方向快捷鈕 */}
      <div className="grid grid-cols-3 gap-1 text-[10px]">
        <button
          type="button"
          onClick={() => applyClinicalPreset('lat_to_med')}
          className="rounded border border-slate-700 bg-slate-900 px-1 py-1 text-slate-200 hover:border-red-400 cursor-pointer"
        >
          由外推內
        </button>
        <button
          type="button"
          onClick={() => applyClinicalPreset('med_to_lat')}
          className="rounded border border-slate-700 bg-slate-900 px-1 py-1 text-slate-200 hover:border-red-400 cursor-pointer"
        >
          由內推外
        </button>
        <button
          type="button"
          onClick={() => applyClinicalPreset('down')}
          className="rounded border border-slate-700 bg-slate-900 px-1 py-1 text-slate-200 hover:border-red-400 cursor-pointer"
        >
          垂直下壓
        </button>
        <button
          type="button"
          onClick={() => applyClinicalPreset('ant_to_post')}
          className="rounded border border-slate-700 bg-slate-900 px-1 py-1 text-slate-200 hover:border-red-400 cursor-pointer"
        >
          由前推後
        </button>
        <button
          type="button"
          onClick={() => applyClinicalPreset('post_to_ant')}
          className="rounded border border-slate-700 bg-slate-900 px-1 py-1 text-slate-200 hover:border-red-400 cursor-pointer"
        >
          由後推前
        </button>
        <button
          type="button"
          onClick={() =>
            addForce({
              targetJoint: activeForce.targetJoint,
              positionRatio: 0.5,
              surfaceAngleDeg: 0,
              forceVectorWorld: [0, -196.2, 0],
              scaleNpm: 1000,
              label: '新增外力',
            })
          }
          className="rounded border border-sky-500/40 bg-sky-950/40 px-1 py-1 text-sky-200 hover:bg-sky-900/50 cursor-pointer"
        >
          + 新增
        </button>
      </div>

      {/* 2D 施力方向觸控盤 + 力道寬滑桿 */}
      <div className="flex items-center gap-2.5">
        <div
          onPointerDown={(e) => {
            e.stopPropagation();
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            dragRef.current = {
              x: e.clientX,
              y: e.clientY,
              az: azimuthDeg,
              el: elevationDeg,
              magN: Math.max(magN, 50),
            };
          }}
          onPointerMove={(e) => {
            if (!dragRef.current) return;
            e.stopPropagation();
            const dx = e.clientX - dragRef.current.x;
            const dy = e.clientY - dragRef.current.y;
            const nextAz = clamp(dragRef.current.az + dx * 2, -180, 180);
            const nextEl = clamp(dragRef.current.el - dy * 1.5, -90, 90);
            updateForce(activeForce.id, {
              forceVectorWorld: sphericalToVec3(dragRef.current.magN, nextAz, nextEl),
            });
          }}
          onPointerUp={() => {
            dragRef.current = null;
          }}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
          className="relative h-[76px] w-[76px] shrink-0 touch-none rounded-lg border border-red-500/40 bg-slate-900/90 cursor-crosshair overflow-hidden"
        >
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-slate-700/60" />
          <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-slate-700/60" />
          <span className="pointer-events-none absolute top-0.5 left-1 text-[8px] text-slate-500">
            方向盤
          </span>
          <div
            style={{ left: `${dotX}%`, top: `${dotY}%` }}
            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-red-100 bg-red-500 shadow"
          />
        </div>

        <div className="flex-1 space-y-1">
          <div className="flex justify-between text-[10px]">
            <span className="text-slate-400">力道</span>
            <span className="font-mono font-semibold text-red-300">
              {magKgf.toFixed(1)} 公斤力
            </span>
          </div>
          <input
            type="range"
            aria-label="施力大小"
            min={0}
            max={60}
            step={0.5}
            value={Number(magKgf.toFixed(1))}
            onChange={(e) => {
              const nextN = Number(e.target.value) * GRAVITY_MPS2;
              const curMag = getForceMagnitudeN(activeForce);
              if (curMag > 1e-4) {
                const ratio = nextN / curMag;
                updateForce(activeForce.id, {
                  forceVectorWorld: [
                    activeForce.forceVectorWorld[0] * ratio,
                    activeForce.forceVectorWorld[1] * ratio,
                    activeForce.forceVectorWorld[2] * ratio,
                  ],
                });
              } else {
                updateForce(activeForce.id, {
                  forceVectorWorld: sphericalToVec3(nextN, azimuthDeg, elevationDeg),
                });
              }
            }}
            className="w-full accent-red-500 cursor-pointer"
          />
          <div className="text-right font-mono text-[9px] text-slate-400">
            {magN.toFixed(0)} 牛頓
          </div>
        </div>
      </div>
    </div>
  );
}
