import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { useSimStore } from '../../store/useSimStore';

export function MuscleHeatmapHUD() {
  const muscleEffectMode = useSimStore((s) => s.muscleEffectMode);
  const summary = useSimStore((s) => s.muscleStrainSummary);
  const [summaryOpen, setSummaryOpen] = useState(true);

  if (muscleEffectMode !== 'strain') return null;

  const topC = summary.topContracting[0];
  const topS = summary.topStretching[0];
  const hasActive = Boolean(topC || topS);

  return (
    <div
      data-testid="muscle-heatmap-hud"
      className="pointer-events-auto absolute left-3 bottom-14 md:bottom-4 z-20 flex flex-col items-start gap-1 max-w-[260px]"
    >
      {hasActive && (
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-950/88 px-2 py-1 text-[10px] shadow-lg backdrop-blur-md">
          {summaryOpen ? (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 leading-tight">
              {topC && (
                <span className="text-amber-300 font-medium">
                  縮短：{topC.zhName} {topC.percentText}
                </span>
              )}
              {topC && topS && <span className="text-slate-600">｜</span>}
              {topS && (
                <span className="text-sky-300 font-medium">
                  拉伸：{topS.zhName} {topS.percentText}
                </span>
              )}
            </div>
          ) : (
            <span className="text-slate-300 font-medium">肌群即時摘要</span>
          )}
          <button
            type="button"
            onClick={() => setSummaryOpen((v) => !v)}
            aria-label={summaryOpen ? '收合摘要' : '展開摘要'}
            className="shrink-0 text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            {summaryOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronUp className="h-3 w-3" />
            )}
          </button>
        </div>
      )}

      {/* 緊湊漸變色階圖例條 (高度 <= 28px) */}
      <div className="flex h-7 items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-950/88 px-2.5 text-[10px] text-slate-200 shadow-lg backdrop-blur-md">
        <span className="shrink-0 font-medium text-amber-300">收縮(橘) ◀</span>
        <div
          className="h-2 w-20 rounded-full border border-white/10"
          style={{
            background:
              'linear-gradient(90deg, #ea580c 0%, #f59e0b 22%, #5c3f3e 50%, #06b6d4 72%, #2563eb 88%, #db2777 100%)',
          }}
        />
        <span className="shrink-0 font-medium text-sky-300">▶ 拉伸(藍)</span>
      </div>
    </div>
  );
}
