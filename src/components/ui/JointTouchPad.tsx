import { ChevronLeft, ChevronRight, Compass, RotateCcw, Scale } from 'lucide-react';
import { ACTION_TRAJECTORIES } from '../../data/actionTrajectories';
import { getJointSliderLimits, JOINT_ORDER, SKELETON_CONFIG } from '../../data/skeletonConfig';
import { useSimStore } from '../../store/useSimStore';
import type { AnatomicalAngles } from '../../types/biomechanics';

export function JointTouchPad() {
  const useTouchPad = useSimStore((s) => s.useTouchPad);
  const showJointHandles = useSimStore((s) => s.showJointHandles);
  const selectedJoint = useSimStore((s) => s.selectedJoint);
  const interactionMode = useSimStore((s) => s.interactionMode);
  const activePresetId = useSimStore((s) => s.activePresetId);
  const autoBalanceStanding = useSimStore((s) => s.autoBalanceStanding);
  const pose = useSimStore((s) => s.pose);
  const jointRiskMap = useSimStore((s) => s.jointRiskMap);
  const setJointAngles = useSimStore((s) => s.setJointAngles);
  const setSelectedJoint = useSimStore((s) => s.setSelectedJoint);
  const setAutoBalanceStanding = useSimStore((s) => s.setAutoBalanceStanding);

  if (!useTouchPad || !showJointHandles || !selectedJoint || interactionMode !== 'pose') {
    return null;
  }

  const cfg = SKELETON_CONFIG[selectedJoint];
  const angles = pose[selectedJoint];
  const risk = jointRiskMap[selectedJoint];

  const [flexMin, flexMax] = cfg.romLimits.flexion;
  const [abdMin, abdMax] = cfg.romLimits.abduction;
  const [rotMin, rotMax] = cfg.romLimits.rotation;
  const sliderLimits = getJointSliderLimits(selectedJoint);

  const flexOut = angles.flexion < flexMin || angles.flexion > flexMax;
  const abdOut = angles.abduction < abdMin || angles.abduction > abdMax;
  const rotOut = angles.rotation < rotMin || angles.rotation > rotMax;

  const safetyRatio = risk === 'critical' ? 100 : risk === 'warning' ? 75 : 32;
  const barColor =
    risk === 'critical'
      ? 'bg-red-500'
      : risk === 'warning'
        ? 'bg-amber-400'
        : 'bg-emerald-400';

  const hasActionScrubber = Boolean(activePresetId && ACTION_TRAJECTORIES[activePresetId]);

  const cycleJoint = (delta: number) => {
    const idx = JOINT_ORDER.indexOf(selectedJoint);
    const nextIdx = (idx + delta + JOINT_ORDER.length) % JOINT_ORDER.length;
    setSelectedJoint(JOINT_ORDER[nextIdx]);
  };

  const axes: Array<{
    key: keyof AnatomicalAngles;
    label: string;
    value: number;
    range: [number, number];
    romRange: [number, number];
    out: boolean;
  }> = [
    {
      key: 'flexion',
      label: '屈伸',
      value: angles.flexion,
      range: sliderLimits.flexion,
      romRange: cfg.romLimits.flexion,
      out: flexOut,
    },
    {
      key: 'abduction',
      label: '外展',
      value: angles.abduction,
      range: sliderLimits.abduction,
      romRange: cfg.romLimits.abduction,
      out: abdOut,
    },
    {
      key: 'rotation',
      label: '旋轉',
      value: angles.rotation,
      range: sliderLimits.rotation,
      romRange: cfg.romLimits.rotation,
      out: rotOut,
    },
  ];

  return (
    <div
      data-testid="joint-touch-pad"
      className={`pointer-events-auto absolute right-3 ${
        hasActionScrubber ? 'bottom-[120px] md:bottom-20' : 'bottom-14 md:bottom-16'
      } z-20 w-[224px] sm:w-[252px] rounded-xl border border-slate-700/80 bg-slate-950/90 p-2.5 shadow-2xl backdrop-blur-md space-y-2`}
    >
      {/* Header: joint switcher & reset */}
      <div className="flex items-center justify-between gap-1 text-[11px]">
        <div className="flex items-center gap-1 min-w-0">
          <button
            type="button"
            onClick={() => cycleJoint(-1)}
            aria-label="上一個關節"
            className="rounded p-0.5 text-slate-400 hover:bg-slate-800 hover:text-sky-300 cursor-pointer"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="flex items-center gap-1 truncate font-semibold text-sky-200">
            <Compass className="h-3.5 w-3.5 shrink-0 text-sky-400" />
            <span className="truncate">{cfg.nameZh}</span>
          </span>
          <button
            type="button"
            onClick={() => cycleJoint(1)}
            aria-label="下一個關節"
            className="rounded p-0.5 text-slate-400 hover:bg-slate-800 hover:text-sky-300 cursor-pointer"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() =>
            setJointAngles(selectedJoint, { flexion: 0, abduction: 0, rotation: 0 })
          }
          title="歸零"
          className="flex shrink-0 items-center gap-0.5 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-300 hover:text-sky-300 cursor-pointer"
        >
          <RotateCcw className="h-2.5 w-2.5" />
          歸零
        </button>
      </div>

      {/* 3-Axis Precision Sliders */}
      <div data-testid="joint-axis-sliders" className="space-y-1.5">
        {axes.map((ax) => (
          <div key={ax.key} className="space-y-0.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-medium text-slate-300">
                {ax.label}
                <span className="ml-1 font-mono text-[9px] text-slate-500">
                  [{ax.romRange[0]}°..{ax.romRange[1]}°]
                </span>
              </span>
              <span
                className={`font-mono font-semibold ${
                  ax.out ? 'text-red-400' : 'text-sky-300'
                }`}
              >
                {ax.value.toFixed(0)}°
              </span>
            </div>
            <input
              type="range"
              aria-label={`${cfg.nameZh}${ax.label}`}
              min={ax.range[0]}
              max={ax.range[1]}
              step={1}
              value={ax.value}
              onChange={(e) =>
                setJointAngles(selectedJoint, { [ax.key]: Number(e.target.value) })
              }
              className={`h-1.5 w-full cursor-pointer rounded-lg ${
                ax.out ? 'accent-red-500' : 'accent-sky-400'
              }`}
            />
          </div>
        ))}
      </div>

      {/* Auto Standing Balance toggle & ROM safety bar */}
      <div className="space-y-1.5 pt-0.5">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setAutoBalanceStanding(!autoBalanceStanding)}
            aria-pressed={autoBalanceStanding}
            className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
              autoBalanceStanding
                ? 'border-emerald-500/60 bg-emerald-950/60 text-emerald-300'
                : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Scale className="h-2.5 w-2.5" />
            站姿重心平衡 {autoBalanceStanding ? '開' : '關'}
          </button>
          <span className="text-[9px] text-slate-400">可拖曳藍球微調四肢</span>
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
