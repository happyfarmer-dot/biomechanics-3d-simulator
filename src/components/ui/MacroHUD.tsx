import { ArrowLeft, Microscope, ShieldAlert } from 'lucide-react';
import { SKELETON_CONFIG } from '../../data/skeletonConfig';
import { useSimStore } from '../../store/useSimStore';

export function MacroHUD() {
  const focusedJointId = useSimStore((s) => s.focusedJointId);
  const setFocusedJoint = useSimStore((s) => s.setFocusedJoint);
  const focusedSoftTissues = useSimStore((s) => s.focusedSoftTissues);

  if (!focusedJointId) return null;

  const jointName = SKELETON_CONFIG[focusedJointId].nameZh;

  return (
    <div className="pointer-events-auto absolute left-1/2 top-3 z-20 -translate-x-1/2 w-[min(600px,calc(100%-16rem))] rounded-xl border border-sky-500/40 bg-slate-950/90 p-3 shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/20 text-sky-300">
            <Microscope className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-semibold text-sky-200">
              局部關節微距 LOD：{jointName}
            </div>
            <div className="text-[10px] text-slate-400">
              非相鄰骨段已自動淡化 (opacity 0.12) · 按 Esc 退出
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setFocusedJoint(null)}
          className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回全身
        </button>
      </div>

      {focusedSoftTissues.length > 0 && (
        <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {focusedSoftTissues.map((t) => {
            const pct = Math.min(200, Math.round(t.loadRatio * 100));
            const colorClass =
              t.status === 'critical'
                ? 'border-red-500/60 bg-red-950/50 text-red-200'
                : t.status === 'warning'
                ? 'border-amber-500/50 bg-amber-950/40 text-amber-200'
                : 'border-emerald-500/30 bg-emerald-950/30 text-emerald-200';
            return (
              <div
                key={t.id}
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] ${colorClass}`}
              >
                <div className="flex items-center justify-between font-semibold">
                  <span className="flex items-center gap-1">
                    {t.status === 'critical' && <ShieldAlert className="h-3 w-3 text-red-400" />}
                    {t.nameZh}
                  </span>
                  <span className="font-mono">{pct}%</span>
                </div>
                <div className="mt-0.5 text-[10px] opacity-85 truncate" title={t.mechanism}>
                  {t.mechanism}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
