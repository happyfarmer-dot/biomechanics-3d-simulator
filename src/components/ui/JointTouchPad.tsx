import { Compass, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Euler, Quaternion, Vector3 } from 'three';
import { getJointSliderLimits, SKELETON_CONFIG } from '../../data/skeletonConfig';
import {
  anatomicalToEuler,
  eulerToAnatomical,
  localEulerToQuaternion,
} from '../../engine/kinematics';
import { useSimStore } from '../../store/useSimStore';
import type { JointId } from '../../types/biomechanics';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

const PRIMARY_CHILD_MAP: Partial<Record<JointId, JointId>> = {
  pelvis: 'lumbar',
  lumbar: 'thorax',
  thorax: 'neck',
  neck: 'head',
  shoulder_L: 'elbow_L',
  elbow_L: 'wrist_L',
  shoulder_R: 'elbow_R',
  elbow_R: 'wrist_R',
  hip_L: 'knee_L',
  knee_L: 'ankle_L',
  hip_R: 'knee_R',
  knee_R: 'ankle_R',
};

export function JointTouchPad() {
  const useTouchPad = useSimStore((s) => s.useTouchPad);
  const selectedJoint = useSimStore((s) => s.selectedJoint);
  const interactionMode = useSimStore((s) => s.interactionMode);
  const pose = useSimStore((s) => s.pose);
  const jointRiskMap = useSimStore((s) => s.jointRiskMap);
  const setJointAngles = useSimStore((s) => s.setJointAngles);

  // Relative joystick offset (-1 .. +1), springs back to (0, 0) on release
  const [joyOffset, setJoyOffset] = useState<{ nx: number; ny: number }>({ nx: 0, ny: 0 });
  const joyOffsetRef = useRef<{ nx: number; ny: number }>({ nx: 0, ny: 0 });
  const padRectRef = useRef<DOMRect | null>(null);

  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const { nx, ny } = joyOffsetRef.current;
      const mag = Math.hypot(nx, ny);
      const state = useSimStore.getState();
      const jId = state.selectedJoint;

      if (mag > 0.04 && jId && state.interactionMode === 'pose') {
        const jState = state.kinematics.joints[jId];
        const parentId = SKELETON_CONFIG[jId].parentId;
        const parentQuat = parentId
          ? new Quaternion(...state.kinematics.joints[parentId].worldQuaternion)
          : new Quaternion();

        // Limb distal vector in world space (uses child joint or virtual terminal segment)
        const childId = PRIMARY_CHILD_MAP[jId];
        const childPos = childId
          ? state.kinematics.joints[childId].worldPosition
          : jState.distalWorldPosition;

        const limbDir = new Vector3(
          childPos[0] - jState.worldPosition[0],
          childPos[1] - jState.worldPosition[1],
          childPos[2] - jState.worldPosition[2]
        );

        if (limbDir.lengthSq() > 1e-6) {
          limbDir.normalize();
          const camRight = new Vector3(...state.cameraVectors.right);
          const camUp = new Vector3(...state.cameraVectors.up);
          const desiredDir = camRight
            .multiplyScalar(nx)
            .add(camUp.multiplyScalar(ny))
            .normalize();

          const worldAxis = new Vector3().crossVectors(limbDir, desiredDir);
          if (worldAxis.lengthSq() > 1e-6) {
            worldAxis.normalize();
            const localAxis = worldAxis.applyQuaternion(parentQuat.clone().invert()).normalize();

            // Speed proportional to joystick displacement (~95 deg/sec at full deflection)
            const angleRad = Math.min(1, mag) * (Math.PI * 0.53) * dt;
            const deltaQ = new Quaternion().setFromAxisAngle(localAxis, angleRad);

            const curAngles = state.pose[jId];
            const currentQ = localEulerToQuaternion(anatomicalToEuler(jId, curAngles));
            const nextQ = deltaQ.multiply(currentQ);
            const nextEuler = new Euler().setFromQuaternion(nextQ, 'ZXY');
            const nextAnat = eulerToAnatomical(jId, nextEuler);

            state.setJointAngles(jId, {
              flexion: Math.round(nextAnat.flexion * 10) / 10,
              abduction: Math.round(nextAnat.abduction * 10) / 10,
            });
          }
        }
      }

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, []);

  if (!useTouchPad || !selectedJoint || interactionMode !== 'pose') return null;

  const cfg = SKELETON_CONFIG[selectedJoint];
  const angles = pose[selectedJoint];
  const risk = jointRiskMap[selectedJoint];

  const [flexMin, flexMax] = cfg.romLimits.flexion;
  const [abdMin, abdMax] = cfg.romLimits.abduction;
  const [rotMin, rotMax] = cfg.romLimits.rotation;
  const sliderLimits = getJointSliderLimits(selectedJoint);
  const rotBound = Math.max(Math.abs(sliderLimits.rotation[0]), Math.abs(sliderLimits.rotation[1]));

  const flexOut = angles.flexion < flexMin || angles.flexion > flexMax;
  const abdOut = angles.abduction < abdMin || angles.abduction > abdMax;
  const rotOut = angles.rotation < rotMin || angles.rotation > rotMax;

  const dotX = clamp(50 + joyOffset.nx * 38, 10, 90);
  const dotY = clamp(50 - joyOffset.ny * 38, 10, 90);

  const updateJoystickFromEvent = (clientX: number, clientY: number) => {
    const rect = padRectRef.current;
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const half = rect.width / 2;
    let nx = (clientX - cx) / half;
    let ny = -(clientY - cy) / half;
    const len = Math.hypot(nx, ny);
    if (len > 1) {
      nx /= len;
      ny /= len;
    }
    joyOffsetRef.current = { nx, ny };
    setJoyOffset({ nx, ny });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    padRectRef.current = el.getBoundingClientRect();
    updateJoystickFromEvent(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!padRectRef.current) return;
    e.stopPropagation();
    updateJoystickFromEvent(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!padRectRef.current) return;
    e.stopPropagation();
    padRectRef.current = null;
    joyOffsetRef.current = { nx: 0, ny: 0 };
    setJoyOffset({ nx: 0, ny: 0 });
  };

  const safetyRatio = risk === 'critical' ? 100 : risk === 'warning' ? 75 : 32;
  const barColor =
    risk === 'critical'
      ? 'bg-red-500'
      : risk === 'warning'
      ? 'bg-amber-400'
      : 'bg-emerald-400';

  return (
    <div
      data-testid="joint-touch-pad"
      className="pointer-events-auto absolute right-3 bottom-14 md:bottom-16 z-20 rounded-xl border border-slate-700/80 bg-slate-950/90 p-2.5 shadow-2xl backdrop-blur-md space-y-2"
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
          className="flex items-center gap-0.5 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-300 hover:text-sky-300 cursor-pointer"
        >
          <RotateCcw className="h-2.5 w-2.5" />
          歸零
        </button>
      </div>

      <div className="flex items-center gap-2.5">
        {/* 96x96 鏡頭視角同步相對搖桿 (放手自動回中) */}
        <div
          data-testid="virtual-joystick-pad"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="relative h-24 w-24 touch-none rounded-lg border border-slate-700 bg-slate-900/90 cursor-grab active:cursor-grabbing overflow-hidden"
        >
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-slate-700/60" />
          <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-slate-700/60" />
          <span className="pointer-events-none absolute top-0.5 left-1/2 -translate-x-1/2 text-[8px] font-medium text-slate-400">
            ▲ 上
          </span>
          <span className="pointer-events-none absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] font-medium text-slate-400">
            ▼ 下
          </span>
          <span className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-[8px] font-medium text-slate-400">
            ◀ 左
          </span>
          <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[8px] font-medium text-slate-400">
            右 ▶
          </span>
          {/* Spring-to-center Joystick Thumb */}
          <div
            style={{ left: `${dotX}%`, top: `${dotY}%` }}
            className={`pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow transition-transform ${
              flexOut || abdOut
                ? 'border-red-200 bg-red-500'
                : 'border-sky-100 bg-sky-400'
            }`}
          />
        </div>

        {/* 內旋 / 外旋 垂直對稱滑條 (正中央 = 0°) */}
        <div className="flex flex-col items-center justify-between h-24">
          <span className="text-[9px] text-slate-400">旋轉</span>
          <input
            type="range"
            min={-rotBound}
            max={rotBound}
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
