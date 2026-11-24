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
  const showJointHandles = useSimStore((s) => s.showJointHandles);
  const setShowJointHandles = useSimStore((s) => s.setShowJointHandles);
  const muscleEffectMode = useSimStore((s) => s.muscleEffectMode);
  const setMuscleEffectMode = useSimStore((s) => s.setMuscleEffectMode);
  const skinOpacity = useSimStore((s) => s.skinOpacity);
  const setSkinOpacity = useSimStore((s) => s.setSkinOpacity);
  const dynamicLoadFactor = useSimStore((s) => s.dynamicLoadFactor);
  const setDynamicLoadFactor = useSimStore((s) => s.setDynamicLoadFactor);
  const sexProfile = useSimStore((s) => s.sexProfile);
  const setSexProfile = useSimStore((s) => s.setSexProfile);
  const romToleranceBoost = useSimStore((s) => s.romToleranceBoost);
  const setRomToleranceBoost = useSimStore((s) => s.setRomToleranceBoost);

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

  const isStrainMode = muscleEffectMode === 'strain';

  return (
    <div ref={containerRef} className="pointer-events-auto absolute left-3 top-3 z-20 flex flex-col items-start gap-2">
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

      {/* 一鍵切換肌群收縮/拉伸特效模式 */}
      <button
        type="button"
        data-testid="muscle-effect-toggle"
        onClick={() => setMuscleEffectMode(isStrainMode ? 'anatomy' : 'strain')}
        title="切換肌肉收縮／拉伸特效"
        className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-lg backdrop-blur-md transition-colors cursor-pointer ${
          isStrainMode
            ? 'border-amber-400/70 bg-gradient-to-r from-amber-500/25 to-sky-500/25 text-amber-100'
            : 'border-slate-700/80 bg-slate-950/85 text-slate-300 hover:border-slate-500'
        }`}
      >
        <Zap className={`h-3 w-3 ${isStrainMode ? 'text-amber-300' : 'text-slate-400'}`} />
        <span>肌群特效</span>
      </button>

      {expanded && (
        <div className="w-52 max-h-[75vh] overflow-y-auto rounded-xl border border-slate-700/80 bg-slate-950/90 p-2.5 shadow-2xl backdrop-blur-md space-y-2.5">
          <div className="space-y-1">
            {LAYER_ITEMS.map(({ key, label, icon: Icon }) => {
              const active = layers[key];
              return (
                <div key={key} className="space-y-1">
                  <button
                    type="button"
                    data-testid={`layer-toggle-${key}`}
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
                  {key === 'skin' && active && (
                    <div className="rounded-lg bg-slate-900/80 px-2 py-1.5 space-y-1 border border-slate-800">
                      <div className="flex items-center justify-between text-[10px] text-slate-300">
                        <span>皮膚透明度</span>
                        <span className="font-mono text-sky-300">{Math.round(skinOpacity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        data-testid="skin-opacity-slider"
                        min={15}
                        max={100}
                        step={1}
                        value={Math.round(skinOpacity * 100)}
                        onChange={(e) => setSkinOpacity(Number(e.target.value) / 100)}
                        className="w-full h-1.5 accent-amber-300 cursor-pointer"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="border-t border-slate-800 pt-2 space-y-2">
            <label className="flex items-center justify-between text-[11px] text-slate-300 cursor-pointer">
              <span>肌群收縮/拉伸特效</span>
              <input
                type="checkbox"
                checked={isStrainMode}
                onChange={(e) => setMuscleEffectMode(e.target.checked ? 'strain' : 'anatomy')}
                className="h-3.5 w-3.5 accent-amber-500 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between text-[11px] text-slate-300 cursor-pointer">
              <span>顯示關節球</span>
              <input
                type="checkbox"
                checked={showJointHandles}
                onChange={(e) => setShowJointHandles(e.target.checked)}
                className="h-3.5 w-3.5 accent-sky-500 cursor-pointer"
              />
            </label>

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

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-slate-300">
                <span>動態衝擊係數 (DAF)</span>
                <span className="font-mono text-amber-300">{dynamicLoadFactor.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                data-testid="dynamic-load-factor-slider"
                min={1.0}
                max={3.0}
                step={0.1}
                value={dynamicLoadFactor}
                onChange={(e) => setDynamicLoadFactor(Number(e.target.value))}
                className="w-full h-1.5 accent-amber-400 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-300">
              <span>生物力學基準</span>
              <div className="flex rounded-md border border-slate-700 bg-slate-900 p-0.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => setSexProfile('male')}
                  className={`rounded px-1.5 py-0.5 cursor-pointer ${
                    sexProfile === 'male' ? 'bg-sky-500/25 text-sky-200' : 'text-slate-400'
                  }`}
                >
                  男
                </button>
                <button
                  type="button"
                  onClick={() => setSexProfile('female')}
                  className={`rounded px-1.5 py-0.5 cursor-pointer ${
                    sexProfile === 'female' ? 'bg-pink-500/25 text-pink-200' : 'text-slate-400'
                  }`}
                >
                  女
                </button>
              </div>
            </div>

            <label className="flex items-center justify-between text-[11px] text-slate-300 cursor-pointer">
              <span>柔軟度 ROM 寬容加成</span>
              <input
                type="checkbox"
                data-testid="rom-tolerance-boost-toggle"
                checked={romToleranceBoost}
                onChange={(e) => setRomToleranceBoost(e.target.checked)}
                className="h-3.5 w-3.5 accent-emerald-500 cursor-pointer"
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
