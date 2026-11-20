import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Move3d,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { PRESET_POSES } from '../../data/presetPoses';
import { useSimStore } from '../../store/useSimStore';

export function TopBar() {
  const activePresetId = useSimStore((s) => s.activePresetId);
  const applyPreset = useSimStore((s) => s.applyPreset);
  const resetPose = useSimStore((s) => s.resetPose);
  const interactionMode = useSimStore((s) => s.interactionMode);
  const setInteractionMode = useSimStore((s) => s.setInteractionMode);
  const alerts = useSimStore((s) => s.alerts);
  const lumbarCompression = useSimStore(
    (s) => s.loads.lumbar?.lumbarEstimatedCompressionN ?? 0
  );

  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
  const warningCount = alerts.filter((a) => a.severity === 'warning').length;

  return (
    <header className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-800 bg-slate-950/90 px-4 py-2 backdrop-blur-md">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400 border border-sky-500/30">
          <Activity className="h-4 w-4" />
        </div>
        <div>
          <h1 className="text-sm font-semibold tracking-wide text-slate-100">
            3D 人體生物力學、局部微距與空間外力模擬器
          </h1>
          <p className="text-[11px] text-slate-400">
            Joint Macro LOD · Spatial Force Vector · Inverse Statics
          </p>
        </div>
      </div>

      {/* Dual Interaction Mode Switch */}
      <div className="flex items-center rounded-lg border border-slate-700/80 bg-slate-900 p-0.5 text-xs">
        <button
          type="button"
          onClick={() => setInteractionMode('pose')}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer ${
            interactionMode === 'pose'
              ? 'bg-sky-500/25 text-sky-200 border border-sky-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Move3d className="h-3.5 w-3.5" />
          調整姿勢模式 (Pose FK)
        </button>
        <button
          type="button"
          onClick={() => setInteractionMode('force')}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer ${
            interactionMode === 'force'
              ? 'bg-red-500/25 text-red-200 border border-red-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
          空間施力模式 (Force Vector)
        </button>
      </div>

      {/* 4 One-Click Preset Scenarios */}
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESET_POSES.map((preset) => {
          const active = activePresetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset.id)}
              title={preset.description}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer border ${
                active
                  ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                  : 'border-slate-700/80 bg-slate-900/80 text-slate-300 hover:border-slate-500 hover:bg-slate-800'
              }`}
            >
              {preset.name}
            </button>
          );
        })}
        <button
          type="button"
          onClick={resetPose}
          title="重設為標準站姿"
          className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          重設
        </button>
      </div>

      {/* Telemetry */}
      <div className="flex items-center gap-2 text-xs">
        <div
          className={`rounded-md border px-2 py-1 font-mono ${
            lumbarCompression > 3400
              ? 'border-red-500/60 bg-red-950/60 text-red-300'
              : lumbarCompression > 2200
              ? 'border-amber-500/50 bg-amber-950/50 text-amber-300'
              : 'border-slate-700 bg-slate-900 text-slate-300'
          }`}
        >
          腰椎壓縮: {Math.round(lumbarCompression)} N
        </div>

        {criticalCount > 0 ? (
          <div className="flex items-center gap-1 rounded-md border border-red-500/60 bg-red-950/70 px-2 py-1 font-medium text-red-300">
            <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
            <span>{criticalCount} CRITICAL</span>
          </div>
        ) : warningCount > 0 ? (
          <div className="flex items-center gap-1 rounded-md border border-amber-500/60 bg-amber-950/70 px-2 py-1 font-medium text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            <span>{warningCount} WARNING</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-950/50 px-2 py-1 font-medium text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>安全範圍</span>
          </div>
        )}
      </div>
    </header>
  );
}
