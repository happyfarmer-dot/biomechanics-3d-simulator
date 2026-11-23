import {
  AlertTriangle,
  ArrowUpRight,
  Info,
  Move3d,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { PRESET_POSES } from '../../data/presetPoses';
import { useSimStore } from '../../store/useSimStore';

export function TopBar() {
  const [showInfo, setShowInfo] = useState(false);

  const activePresetId = useSimStore((s) => s.activePresetId);
  const applyPreset = useSimStore((s) => s.applyPreset);
  const resetPose = useSimStore((s) => s.resetPose);
  const interactionMode = useSimStore((s) => s.interactionMode);
  const setInteractionMode = useSimStore((s) => s.setInteractionMode);
  const alerts = useSimStore((s) => s.alerts);
  const modelStatus = useSimStore((s) => s.modelStatus);
  const integrityReport = useSimStore((s) => s.integrityReport);
  const lumbarCompression = useSimStore(
    (s) => s.loads.lumbar?.lumbarEstimatedCompressionN ?? 0
  );

  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
  const warningCount = alerts.filter((a) => a.severity === 'warning').length;

  return (
    <>
      <header className="flex h-11 shrink-0 items-center justify-between gap-1.5 border-b border-slate-800 bg-slate-950/95 px-2 backdrop-blur-md">
        {/* 姿勢 / 施力 雙模式切換膠囊 */}
        <div className="flex shrink-0 items-center rounded-full border border-slate-700/80 bg-slate-900 p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setInteractionMode('pose')}
            className={`flex items-center gap-0.5 rounded-full px-2 py-1 font-medium transition-colors cursor-pointer ${
              interactionMode === 'pose'
                ? 'bg-sky-500/25 text-sky-200 border border-sky-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Move3d className="h-3 w-3" />
            姿勢
          </button>
          <button
            type="button"
            onClick={() => setInteractionMode('force')}
            className={`flex items-center gap-0.5 rounded-full px-2 py-1 font-medium transition-colors cursor-pointer ${
              interactionMode === 'force'
                ? 'bg-red-500/25 text-red-200 border border-red-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowUpRight className="h-3 w-3" />
            施力
          </button>
        </div>

        {/* 情境選單 */}
        <select
          aria-label="情境選單"
          value={activePresetId ?? ''}
          onChange={(e) => {
            if (e.target.value) applyPreset(e.target.value);
          }}
          className="min-w-0 flex-1 max-w-[155px] rounded-lg border border-slate-700 bg-slate-900 px-1.5 py-1 text-[11px] text-slate-100 focus:border-sky-500 focus:outline-none cursor-pointer truncate"
        >
          {!activePresetId && <option value="">自訂姿勢</option>}
          {PRESET_POSES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {/* 腰椎負荷 + 重置 + 資訊 */}
        <div className="flex shrink-0 items-center gap-1 text-[11px]">
          <div
            className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono ${
              criticalCount > 0 || lumbarCompression > 3400
                ? 'border-red-500/60 bg-red-950/70 text-red-300'
                : warningCount > 0 || lumbarCompression > 2200
                ? 'border-amber-500/60 bg-amber-950/70 text-amber-300'
                : 'border-emerald-500/40 bg-emerald-950/50 text-emerald-300'
            }`}
          >
            {criticalCount > 0 ? (
              <ShieldAlert className="h-3 w-3 shrink-0 text-red-400" />
            ) : warningCount > 0 ? (
              <AlertTriangle className="h-3 w-3 shrink-0 text-amber-400" />
            ) : (
              <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-400" />
            )}
            <span>{Math.round(lumbarCompression)}N</span>
          </div>

          <button
            type="button"
            onClick={resetPose}
            title="重置"
            aria-label="重置"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setShowInfo((v) => !v)}
            title="模型資訊"
            aria-label="模型資訊"
            className="relative flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 cursor-pointer"
          >
            <Info className="h-3.5 w-3.5" />
            <span
              className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ${
                modelStatus.state === 'loaded' && integrityReport?.allPassed !== false
                  ? 'bg-emerald-400'
                  : modelStatus.state === 'error' || integrityReport?.allPassed === false
                  ? 'bg-red-500'
                  : 'bg-slate-400'
              }`}
            />
          </button>
        </div>
      </header>

      {/* 模型狀態、自檢報告與免責聲明彈窗 */}
      {showInfo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setShowInfo(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-950 p-4 text-xs text-slate-300 shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between font-semibold text-slate-100">
              <span>模型狀態與自動化自檢報告</span>
              <button
                type="button"
                onClick={() => setShowInfo(false)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div
              className={`rounded-lg border px-3 py-2 font-medium ${
                modelStatus.state === 'loaded'
                  ? 'border-emerald-500/50 bg-emerald-950/50 text-emerald-300'
                  : modelStatus.state === 'error'
                  ? 'border-red-500/60 bg-red-950/60 text-red-300'
                  : 'border-slate-700 bg-slate-900 text-slate-400'
              }`}
            >
              {modelStatus.state === 'loaded'
                ? '模型狀態：真實解剖網格（雙四元數蒙皮已啟用）'
                : modelStatus.state === 'error'
                ? `未找到解剖模型（原因：${modelStatus.message ?? '載入失敗'}）`
                : '模型狀態：載入中...'}
            </div>

            {integrityReport && (
              <div className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-900/70 p-2.5">
                <div className="flex items-center justify-between text-[11px] font-semibold">
                  <span>起止點附著與關節連動自我檢查</span>
                  <span
                    className={
                      integrityReport.allPassed ? 'text-emerald-400' : 'text-red-400'
                    }
                  >
                    {integrityReport.allPassed ? '全部通過' : '發現異常'}
                  </span>
                </div>
                {integrityReport.checks.map((c) => (
                  <div
                    key={c.id}
                    className="rounded border border-slate-800 bg-slate-950/80 p-1.5 text-[10px]"
                  >
                    <div className="flex items-center justify-between font-medium">
                      <span className="text-slate-200">{c.title}</span>
                      <span
                        className={
                          c.passed ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'
                        }
                      >
                        {c.passed ? '通過' : '未通過'}
                      </span>
                    </div>
                    <div className="mt-0.5 text-slate-400 leading-snug">{c.detail}</div>
                  </div>
                ))}
              </div>
            )}

            <p className="leading-relaxed text-slate-400 text-[11px]">
              色階反映肌群幾何縮短（向心位置）與拉伸（離心位置），實際生理發力須搭配施力方向綜合判讀。
            </p>
            <p className="leading-relaxed text-slate-400 text-[11px]">
              本系統為靜力學與活動度簡化教學模型，韌帶負荷為方向性受力估算，非臨床醫療診斷或有限元素分析。
            </p>
          </div>
        </div>
      )}
    </>
  );
}
