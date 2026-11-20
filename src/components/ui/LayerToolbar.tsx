import {
  ArrowUpRight,
  Bone,
  Compass,
  Eye,
  EyeOff,
  GitBranch,
  Layers,
  User,
  Zap,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSimStore } from '../../store/useSimStore';
import type { LayerVisibility } from '../../types/biomechanics';

const LAYER_ITEMS: Array<{
  key: keyof LayerVisibility;
  label: string;
  icon: typeof Bone;
}> = [
  { key: 'skin', label: '外皮', icon: User },
  { key: 'skeleton', label: '骨骼', icon: Bone },
  { key: 'muscles', label: '肌肉', icon: Zap },
  { key: 'macroLigaments', label: '韌帶', icon: GitBranch },
  { key: 'jointCapsule', label: '關節囊', icon: Layers },
  { key: 'spatialComponents', label: '分力', icon: ArrowUpRight },
  { key: 'axesDebug', label: '座標軸', icon: Compass },
];

export function LayerToolbar() {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const layers = useSimStore((s) => s.layers);
  const toggleLayer = useSimStore((s) => s.toggleLayer);
  const heightM = useSimStore((s) => s.heightM);
  const bodyMassKg = useSimStore((s) => s.bodyMassKg);
  const setAnthropometry = useSimStore((s) => s.setAnthropometry);
  const includeGravity = useSimStore((s) => s.includeGravity);
  const setIncludeGravity = useSimStore((s) => s.setIncludeGravity);
  const useTouchPad = useSimStore((s) => s.useTouchPad);
  const setUseTouchPad = useSimStore((s) => s.setUseTouchPad);

  useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [expanded]);

  return (
    <div ref={containerRef} className="pointer-events-auto absolute left-3 top-3 z-20">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        title="圖層"
        aria-label="圖層"
        className={`flex h-[38px] w-[38px] items-center justify-center rounded-full border shadow-lg backdrop-blur-md transition-colors cursor-pointer ${
          expanded
            ? 'border-sky-400 bg-sky-500/25 text-sky-200'
            : 'border-slate-700/80 bg-slate-950/85 text-slate-200 hover:border-slate-500'
        }`}
      >
        <Layers className="h-4 w-4" />
      </button>

      {expanded && (
        <div className="mt-2 w-48 rounded-xl border border-slate-700/80 bg-slate-950/90 p-2.5 shadow-2xl backdrop-blur-md space-y-2.5">
          <div className="space-y-1">
            {LAYER_ITEMS.map(({ key, label, icon: Icon }) => {
              const active = layers[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleLayer(key)}
                  className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs transition-colors cursor-pointer ${
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

          <div className="border-t border-slate-800 pt-2 space-y-2">
            <label className="flex items-center justify-between text-[11px] text-slate-300 cursor-pointer">
              <span>指尖雙軸羅盤</span>
              <input
                type="checkbox"
                checked={useTouchPad}
                onChange={(e) => setUseTouchPad(e.target.checked)}
                className="h-3.5 w-3.5 accent-sky-500 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between text-[11px] text-slate-300 cursor-pointer">
              <span>計入肢段自重</span>
              <input
                type="checkbox"
                checked={includeGravity}
                onChange={(e) => setIncludeGravity(e.target.checked)}
                className="h-3.5 w-3.5 accent-sky-500 cursor-pointer"
              />
            </label>

            <div className="grid grid-cols-2 gap-1.5">
              <label className="block text-[10px] text-slate-400">
                身高 (公尺)
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
              <label className="block text-[10px] text-slate-400">
                體重 (公斤)
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
    </div>
  );
}
