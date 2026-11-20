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
    <div className="pointer-events-auto absolute left-1/2 top-3 z-10 -translate-x-1/2 w-[min(480px,calc(100%-6.5rem))] rounded-xl border border-sky-500/40 bg-slate-950/90 p-2.5 shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-sky-500/20 text-sky-300">
            <Microscope className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-sky-200">
              微距檢視：{jointName}
            </div>
            <div className="hidden sm:block text-[10px] text-slate-400">
              非相鄰骨段已自動淡化 · 按返回鍵退出
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setFocusedJoint(null)}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-800 cursor-pointer"
        >
          <ArrowLeft className="h-3 w-3" />
          返回全身
        </button>
      </div>

      {focusedSoftTissues.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-1 max-h-28 overflow-y-auto">
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
                className={`rounded-md border px-2 py-1 text-[10px] ${colorClass}`}
              >
                <div className="flex items-center justify-between font-semibold gap-1">
                  <span className="flex items-center gap-1 truncate">
                    {t.status === 'critical' && <ShieldAlert className="h-2.5 w-2.5 shrink-0 text-red-400" />}
                    {t.nameZh}
                  </span>
                  <span className="font-mono shrink-0">{pct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
