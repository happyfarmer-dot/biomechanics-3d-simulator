import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { ACTION_TRAJECTORIES } from '../../data/actionTrajectories';
import { useSimStore } from '../../store/useSimStore';

export function MuscleHeatmapHUD() {
  const muscleEffectMode = useSimStore((s) => s.muscleEffectMode);
  const muscleStrainSubMode = useSimStore((s) => s.muscleStrainSubMode);
  const setMuscleStrainSubMode = useSimStore((s) => s.setMuscleStrainSubMode);
  const activePresetId = useSimStore((s) => s.activePresetId);
  const summary = useSimStore((s) => s.muscleStrainSummary);
  const [summaryOpen, setSummaryOpen] = useState(true);

  if (muscleEffectMode !== 'strain') return null;

  const hasActionScrubber = Boolean(activePresetId && ACTION_TRAJECTORIES[activePresetId]);
  const topC = summary.topContracting[0];
  const topS = summary.topStretching[0];
  const hasActive = Boolean(topC || topS);

  return (
    <div
      data-testid="muscle-heatmap-hud"
      className={`pointer-events-auto absolute left-3 ${
        hasActionScrubber ? 'bottom-[120px] md:bottom-20' : 'bottom-14 md:bottom-4'
      } z-20 flex flex-col items-start gap-1 max-w-[260px]`}
    >
      {/* 幾何伸長 / 主動張力 子模式切換 */}
      <div className="flex items-center rounded-full border border-slate-700/80 bg-slate-950/88 p-0.5 text-[10px] shadow-lg backdrop-blur-md">
        <button
          type="button"
          data-testid="strain-submode-geometric"
          onClick={() => setMuscleStrainSubMode('geometric')}
          className={`rounded-full px-2 py-0.5 font-medium transition-colors cursor-pointer ${
            muscleStrainSubMode === 'geometric'
              ? 'bg-sky-500/25 text-sky-200 border border-sky-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          幾何伸長
        </button>
        <button
          type="button"
          data-testid="strain-submode-activeTension"
          onClick={() => setMuscleStrainSubMode('activeTension')}
          className={`rounded-full px-2 py-0.5 font-medium transition-colors cursor-pointer ${
            muscleStrainSubMode === 'activeTension'
              ? 'bg-amber-500/25 text-amber-200 border border-amber-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          主動張力
        </button>
      </div>

      {hasActive && (
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-950/88 px-2 py-1 text-[10px] shadow-lg backdrop-blur-md">
          {summaryOpen ? (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 leading-tight">
              {topC && (
                <span className="text-amber-300 font-medium">
                  {muscleStrainSubMode === 'activeTension' ? '向心負荷' : '縮短'}：{topC.zhName} {topC.percentText}
                </span>
              )}
              {topC && topS && <span className="text-slate-600">｜</span>}
              {topS && (
                <span className="text-sky-300 font-medium">
                  {muscleStrainSubMode === 'activeTension' ? '離心張力' : '拉伸'}：{topS.zhName} {topS.percentText}
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
        <span className="shrink-0 font-medium text-amber-300">
          {muscleStrainSubMode === 'activeTension' ? '主動發力 ◀' : '收縮(橘) ◀'}
        </span>
        <div
          className="h-2 w-20 rounded-full border border-white/10"
          style={{
            background:
              'linear-gradient(90deg, #ea580c 0%, #f59e0b 22%, #5c3f3e 50%, #06b6d4 72%, #2563eb 88%, #db2777 100%)',
          }}
        />
        <span className="shrink-0 font-medium text-sky-300">
          {muscleStrainSubMode === 'activeTension' ? '▶ 離心過載' : '▶ 拉伸(藍)'}
        </span>
      </div>
    </div>
  );
}
