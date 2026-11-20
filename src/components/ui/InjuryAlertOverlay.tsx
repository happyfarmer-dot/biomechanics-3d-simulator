import { AlertTriangle, ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSimStore } from '../../store/useSimStore';

export function InjuryAlertOverlay() {
  const [expanded, setExpanded] = useState(false);
  const alerts = useSimStore((s) => s.alerts);
  const focusedJointId = useSimStore((s) => s.focusedJointId);
  const setFocusedJoint = useSimStore((s) => s.setFocusedJoint);

  const sortedAlerts = useMemo(() => {
    return [...alerts].sort((a, b) => {
      if (a.severity === b.severity) return 0;
      return a.severity === 'critical' ? -1 : 1;
    });
  }, [alerts]);

  if (sortedAlerts.length === 0) return null;

  const visibleAlerts = expanded ? sortedAlerts : sortedAlerts.slice(0, 2);
  const extraCount = sortedAlerts.length - 2;

  return (
    <div
      data-testid="injury-alert-overlay"
      className={`pointer-events-auto absolute left-3 ${focusedJointId ? 'top-36' : 'top-14'} z-20 w-[min(265px,calc(100vw-8rem))] space-y-1.5`}
    >
      {visibleAlerts.map((alert) => {
        const isCrit = alert.severity === 'critical';
        return (
          <div
            key={alert.id}
            onClick={() => setFocusedJoint(alert.jointId)}
            className={`cursor-pointer rounded-xl border p-2 text-[11px] shadow-xl backdrop-blur-md transition-colors ${
              isCrit
                ? 'border-red-500/60 bg-red-950/75 text-red-100 hover:bg-red-950/90'
                : 'border-amber-500/50 bg-amber-950/75 text-amber-100 hover:bg-amber-950/90'
            }`}
          >
            <div className="flex items-start justify-between gap-1 font-semibold leading-tight">
              <span className="flex items-center gap-1">
                {isCrit ? (
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-red-400" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                )}
                <span>{alert.title}</span>
              </span>
              {alert.valueText && (
                <span className="shrink-0 rounded bg-black/40 px-1 py-0.5 font-mono text-[9px]">
                  {alert.valueText}
                </span>
              )}
            </div>
            <div className="mt-1 text-[10px] leading-snug opacity-90">
              <span className="font-semibold text-white/80">受損組織：</span>
              {alert.tissue}
            </div>
            <div className="mt-0.5 text-[10px] leading-snug opacity-85 line-clamp-2">
              <span className="font-semibold text-white/80">具體傷害：</span>
              {alert.mechanism}
            </div>
          </div>
        );
      })}

      {extraCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 rounded-lg border border-red-500/40 bg-slate-950/85 px-2.5 py-1 text-[10px] font-semibold text-red-200 shadow backdrop-blur-md hover:bg-slate-900 cursor-pointer"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" />
              收合警示
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              +{extraCount} 則警示
            </>
          )}
        </button>
      )}
    </div>
  );
}
