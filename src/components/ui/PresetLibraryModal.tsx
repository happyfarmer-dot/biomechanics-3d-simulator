import { Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { PRESET_POSES } from '../../data/presetPoses';
import { useSimStore } from '../../store/useSimStore';
import type { PresetCategory } from '../../types/biomechanics';

const CATEGORY_TABS: Array<{ key: 'all' | PresetCategory; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'strength', label: '重訓' },
  { key: 'bodyweight', label: '徒手' },
  { key: 'sports', label: '球類田徑' },
  { key: 'mobility', label: '伸展瑜珈' },
  { key: 'ergonomics', label: '工傷日常' },
];

export function PresetLibraryModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | PresetCategory>('all');
  const activePresetId = useSimStore((s) => s.activePresetId);
  const applyPreset = useSimStore((s) => s.applyPreset);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PRESET_POSES.filter((p) => {
      if (category !== 'all' && p.category !== category) return false;
      if (!q) return true;
      const inName = p.name.toLowerCase().includes(q);
      const inDesc = p.description.toLowerCase().includes(q);
      const inMuscles = (p.targetMuscles ?? []).some((m) => m.toLowerCase().includes(q));
      return inName || inDesc || inMuscles;
    });
  }, [query, category]);

  if (!open) return null;

  return createPortal(
    <div
      data-testid="preset-library-modal"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
        background: 'rgba(0, 0, 0, 0.72)',
      }}
      className="backdrop-blur-md"
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          maxHeight: '82dvh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        className="rounded-2xl border border-slate-700/80 bg-slate-900/95 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <h2 className="text-sm font-bold text-slate-100">運動姿勢庫（{PRESET_POSES.length} 種）</h2>
            <p className="text-[11px] text-slate-400">選擇動作即時套用全身關節角度與生物力學負荷</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2.5 border-b border-slate-800 px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              data-testid="preset-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋動作名稱、目標肌群（例如：深蹲、背闊肌、羽球）..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950/80 py-1.5 pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {CATEGORY_TABS.map((tab) => {
              const active = category === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  data-testid={`preset-tab-${tab.key}`}
                  onClick={() => setCategory(tab.key)}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-sky-500/25 text-sky-200 border border-sky-400/60'
                      : 'bg-slate-800/70 text-slate-400 border border-slate-700/60 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 overflow-y-auto p-3 sm:grid-cols-2">
          {filtered.map((p) => {
            const isSelected = activePresetId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                data-testid={`preset-card-${p.id}`}
                onClick={() => {
                  applyPreset(p.id);
                  onClose();
                }}
                className={`flex flex-col items-start gap-1.5 rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'border-sky-400 bg-sky-500/15 shadow-md'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-600 hover:bg-slate-900'
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-100">{p.name}</span>
                  {p.forces.length > 0 && (
                    <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] text-amber-300">
                      含外力
                    </span>
                  )}
                </div>
                <p className="line-clamp-2 text-[10px] leading-relaxed text-slate-400">
                  {p.description}
                </p>
                {p.targetMuscles && p.targetMuscles.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {p.targetMuscles.map((m) => (
                      <span
                        key={m}
                        className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-sky-300"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full py-8 text-center text-xs text-slate-500">
              找不到符合「{query}」的姿勢或運動模式
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
