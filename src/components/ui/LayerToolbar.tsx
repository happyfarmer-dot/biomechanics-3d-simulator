import {
  ArrowUpRight,
  Bone,
  Compass,
  Eye,
  EyeOff,
  GitBranch,
  Layers,
  Minus,
  Plus,
  User,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { useSimStore } from '../../store/useSimStore';
import type { LayerVisibility } from '../../types/biomechanics';

const LAYER_ITEMS: Array<{
  key: keyof LayerVisibility;
  label: string;
  icon: typeof Bone;
}> = [
  { key: 'skin', label: '半透明外皮輪廓', icon: User },
  { key: 'skeleton', label: '骨骼系統', icon: Bone },
  { key: 'muscles', label: '立體肌群紋理', icon: Zap },
  { key: 'macroLigaments', label: '局部韌帶 LOD', icon: GitBranch },
  { key: 'jointCapsule', label: '關節囊包膜', icon: Layers },
  { key: 'spatialComponents', label: '空間分力向量', icon: ArrowUpRight },
  { key: 'axesDebug', label: '關節座標軸 Debug', icon: Compass },
];

export function LayerToolbar() {
  const [expanded, setExpanded] = useState(true);
  const layers = useSimStore((s) => s.layers);
  const toggleLayer = useSimStore((s) => s.toggleLayer);
  const heightM = useSimStore((s) => s.heightM);
  const bodyMassKg = useSimStore((s) => s.bodyMassKg);
  const setAnthropometry = useSimStore((s) => s.setAnthropometry);
  const includeGravity = useSimStore((s) => s.includeGravity);
  const setIncludeGravity = useSimStore((s) => s.setIncludeGravity);

  return (
    <>
      <aside className="pointer-events-auto absolute left-3 top-3 z-20 w-56 rounded-xl border border-slate-700/70 bg-slate-950/85 shadow-2xl backdrop-blur-md">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-900/60 rounded-t-xl cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Layers className="h-3.5 w-3.5 text-sky-400" />
            系統 +/-
          </span>
          {expanded ? (
            <Minus className="h-3.5 w-3.5 text-slate-400" />
          ) : (
            <Plus className="h-3.5 w-3.5 text-slate-400" />
          )}
        </button>

        {expanded && (
          <div className="border-t border-slate-800 p-2.5 space-y-3">
            <div className="space-y-1">
              {LAYER_ITEMS.map(({ key, label, icon: Icon }) => {
                const active = layers[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleLayer(key)}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
                      active
                        ? 'bg-sky-500/15 text-sky-200 border border-sky-500/30'
                        : 'bg-slate-900/50 text-slate-400 border border-transparent hover:bg-slate-900'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </span>
                    {active ? (
                      <Eye className="h-3.5 w-3.5 text-sky-400" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5 text-slate-600" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="border-t border-slate-800 pt-2.5 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span>計入肢段自重 (Gravity)</span>
                <input
                  type="checkbox"
                  checked={includeGravity}
                  onChange={(e) => setIncludeGravity(e.target.checked)}
                  className="h-3.5 w-3.5 accent-sky-500 cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block text-[11px] text-slate-400">
                  身高 (m)
                  <input
                    type="number"
                    step={0.01}
                    min={1.2}
                    max={2.2}
                    value={heightM}
                    onChange={(e) => setAnthropometry(Number(e.target.value) || 1.75, bodyMassKg)}
                    className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-xs font-mono text-slate-200"
                  />
                </label>
                <label className="block text-[11px] text-slate-400">
                  體重 (kg)
                  <input
                    type="number"
                    step={1}
                    min={35}
                    max={180}
                    value={bodyMassKg}
                    onChange={(e) => setAnthropometry(heightM, Number(e.target.value) || 70)}
                    className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-xs font-mono text-slate-200"
                  />
                </label>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Bottom-left Medical Disclaimer */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-20 max-w-sm rounded-lg border border-slate-800/80 bg-slate-950/75 px-2.5 py-1.5 text-[11px] text-slate-400 backdrop-blur-sm">
        本系統為靜力學與活動度簡化教學模型，韌帶負荷為方向性受力估算，非臨床醫療診斷或有限元素分析
      </div>
    </>
  );
}
