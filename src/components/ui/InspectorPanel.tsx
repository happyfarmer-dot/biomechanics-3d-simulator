import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Microscope,
  Plus,
  RotateCcw,
  ShieldAlert,
  Sliders,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import {
  getJointSliderLimits,
  GRAVITY_MPS2,
  JOINT_ORDER,
  SKELETON_CONFIG,
} from '../../data/skeletonConfig';
import { getForceMagnitudeN } from '../../engine/staticsEngine';
import { useSimStore } from '../../store/useSimStore';
import type { AnatomicalAngles, ForceScaleNpm, JointId } from '../../types/biomechanics';

type TabKey = 'joints' | 'forces' | 'risks';

const AXIS_META: Array<{
  key: keyof AnatomicalAngles;
  label: string;
}> = [
  { key: 'flexion', label: '屈曲 / 伸展' },
  { key: 'abduction', label: '外展 / 內收' },
  { key: 'rotation', label: '軸向旋轉' },
];

export function InspectorPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>('joints');

  const pose = useSimStore((s) => s.pose);
  const selectedJoint = useSimStore((s) => s.selectedJoint) ?? 'knee_R';
  const focusedJointId = useSimStore((s) => s.focusedJointId);
  const setSelectedJoint = useSimStore((s) => s.setSelectedJoint);
  const setFocusedJoint = useSimStore((s) => s.setFocusedJoint);
  const setJointAngles = useSimStore((s) => s.setJointAngles);
  const loads = useSimStore((s) => s.loads);
  const alerts = useSimStore((s) => s.alerts);
  const muscles = useSimStore((s) => s.muscles);
  const forces = useSimStore((s) => s.forces);
  const selectedForceId = useSimStore((s) => s.selectedForceId);
  const setSelectedForceId = useSimStore((s) => s.setSelectedForceId);
  const addForce = useSimStore((s) => s.addForce);
  const updateForce = useSimStore((s) => s.updateForce);
  const invertForce = useSimStore((s) => s.invertForce);
  const removeForce = useSimStore((s) => s.removeForce);

  const jointCfg = SKELETON_CONFIG[selectedJoint];
  const jointAngles = pose[selectedJoint];
  const jointLoad = loads[selectedJoint];
  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;

  const openTab = (nextTab: TabKey) => {
    setTab(nextTab);
    setIsOpen(true);
  };

  const renderContent = () => (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {tab === 'joints' && (
        <>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-400">選取操控關節（雙擊模型可微距）</label>
              <button
                type="button"
                onClick={() =>
                  setJointAngles(selectedJoint, { flexion: 0, abduction: 0, rotation: 0 })
                }
                className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                歸零此關節
              </button>
            </div>
            <div className="flex gap-1.5">
              <select
                value={selectedJoint}
                onChange={(e) => setSelectedJoint(e.target.value as JointId)}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
              >
                {JOINT_ORDER.map((id) => (
                  <option key={id} value={id}>
                    {SKELETON_CONFIG[id].nameZh}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  setFocusedJoint(focusedJointId === selectedJoint ? null : selectedJoint)
                }
                className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium cursor-pointer transition-colors ${
                  focusedJointId === selectedJoint
                    ? 'border-sky-400 bg-sky-500/25 text-sky-200'
                    : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-sky-500/50'
                }`}
              >
                <Microscope className="h-3.5 w-3.5" />
                {focusedJointId === selectedJoint ? '退出微距' : '局部放大'}
              </button>
            </div>
          </div>

          <div className="space-y-2.5 rounded-xl border border-slate-800 bg-slate-900/50 p-2.5">
            {AXIS_META.map(({ key, label }) => {
              const val = jointAngles[key];
              const [romMin, romMax] = jointCfg.romLimits[key];
              const [sliderMin, sliderMax] = getJointSliderLimits(selectedJoint)[key];
              const outOfRom = val < romMin || val > romMax;
              return (
                <div key={key} className="space-y-0.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">{label}</span>
                    <span
                      className={`font-mono font-semibold ${
                        outOfRom ? 'text-red-400' : 'text-sky-300'
                      }`}
                    >
                      {val.toFixed(1)}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={sliderMin}
                    max={sliderMax}
                    step={0.5}
                    value={val}
                    onChange={(e) =>
                      setJointAngles(selectedJoint, { [key]: Number(e.target.value) })
                    }
                    className="w-full accent-sky-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>安全範圍: [{romMin}°, {romMax}°]</span>
                    <span>{outOfRom ? '超界' : '正常'}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {jointLoad && (
            <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/50 p-2.5">
              <div className="text-xs font-semibold text-slate-300">局部反作用力與力矩</div>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <div className="rounded-lg bg-slate-950/80 p-2 border border-slate-800/80">
                  <div className="text-[10px] text-cyan-400">軸向力</div>
                  <div className="font-mono font-semibold text-slate-100">
                    {jointLoad.axialForceN.toFixed(1)} 牛頓
                  </div>
                </div>
                <div className="rounded-lg bg-slate-950/80 p-2 border border-slate-800/80">
                  <div className="text-[10px] text-purple-400">內外剪力</div>
                  <div className="font-mono font-semibold text-slate-100">
                    {jointLoad.mlShearN.toFixed(1)} 牛頓
                  </div>
                </div>
                <div className="rounded-lg bg-slate-950/80 p-2 border border-slate-800/80">
                  <div className="text-[10px] text-orange-400">前後剪力</div>
                  <div className="font-mono font-semibold text-slate-100">
                    {jointLoad.apShearN.toFixed(1)} 牛頓
                  </div>
                </div>
                <div className="rounded-lg bg-slate-950/80 p-2 border border-slate-800/80">
                  <div className="text-[10px] text-amber-400">關節彎矩</div>
                  <div className="font-mono font-semibold text-slate-100">
                    {jointLoad.bendingMomentNm.toFixed(1)} 牛頓·米
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'forces' && (
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() =>
              addForce({
                targetJoint: selectedJoint,
                positionRatio: 0.75,
                surfaceAngleDeg: -90,
                forceVectorWorld: [250, 0, 0],
                scaleNpm: 1000,
                label: '空間施力',
              })
            }
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/15 py-2 text-xs font-medium text-red-200 hover:bg-red-500/25 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            在 {SKELETON_CONFIG[selectedJoint].nameZh} 新增空間施力線
          </button>

          {forces.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 p-5 text-center text-xs text-slate-500">
              目前無空間施力線，點擊上方按鈕即可新增並拖曳紅色端點。
            </div>
          ) : (
            forces.map((f, idx) => {
              const magN = getForceMagnitudeN(f);
              const isSel = selectedForceId === f.id || (!selectedForceId && idx === 0);
              return (
                <div
                  key={f.id}
                  onClick={() => setSelectedForceId(f.id)}
                  className={`space-y-2 rounded-xl border p-2.5 text-xs ${
                    isSel
                      ? 'border-red-500/60 bg-slate-900/90'
                      : 'border-slate-800 bg-slate-900/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-red-300">
                      施力 #{idx + 1} · {magN.toFixed(0)} 牛頓 ({(magN / GRAVITY_MPS2).toFixed(1)} 公斤力)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          invertForce(f.id);
                        }}
                        className="flex items-center gap-1 rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-[11px] text-amber-300 hover:border-amber-500/60 cursor-pointer"
                      >
                        <ArrowLeftRight className="h-3 w-3" />
                        反轉推/拉方向
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeForce(f.id);
                        }}
                        className="text-slate-500 hover:text-red-400 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[11px] text-slate-400">
                      目標骨段
                      <select
                        value={f.targetJoint}
                        onChange={(e) =>
                          updateForce(f.id, { targetJoint: e.target.value as JointId })
                        }
                        className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-xs text-slate-200"
                      >
                        {JOINT_ORDER.map((id) => (
                          <option key={id} value={id}>
                            {SKELETON_CONFIG[id].nameZh}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-[11px] text-slate-400">
                      向量比例尺
                      <select
                        value={f.scaleNpm}
                        onChange={(e) =>
                          updateForce(f.id, {
                            scaleNpm: Number(e.target.value) as ForceScaleNpm,
                          })
                        }
                        className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-xs font-mono text-slate-200"
                      >
                        <option value={500}>500 牛頓/公尺</option>
                        <option value={1000}>1000 牛頓/公尺</option>
                        <option value={2000}>2000 牛頓/公尺</option>
                      </select>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[11px] text-slate-400">
                      沿骨段位置 ({(f.positionRatio * 100).toFixed(0)}%)
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={f.positionRatio}
                        onChange={(e) =>
                          updateForce(f.id, { positionRatio: Number(e.target.value) })
                        }
                        className="mt-1 w-full accent-sky-500 cursor-pointer"
                      />
                    </label>
                    <label className="block text-[11px] text-slate-400">
                      表面方位角 ({f.surfaceAngleDeg ?? 0}°)
                      <input
                        type="range"
                        min={-180}
                        max={180}
                        step={15}
                        value={f.surfaceAngleDeg ?? 0}
                        onChange={(e) =>
                          updateForce(f.id, { surfaceAngleDeg: Number(e.target.value) })
                        }
                        className="mt-1 w-full accent-sky-500 cursor-pointer"
                      />
                    </label>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === 'risks' && (
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-300">
              損傷風險與過載警示 ({alerts.length})
            </div>
            {alerts.length === 0 ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-3 text-xs text-emerald-300">
                目前姿勢與負荷均在安全範圍內。
              </div>
            ) : (
              alerts.map((alert) => {
                const isCrit = alert.severity === 'critical';
                return (
                  <div
                    key={alert.id}
                    onClick={() => setFocusedJoint(alert.jointId)}
                    className={`cursor-pointer rounded-xl border p-2.5 text-xs space-y-1 ${
                      isCrit
                        ? 'border-red-500/50 bg-red-950/40'
                        : 'border-amber-500/40 bg-amber-950/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 font-semibold">
                      <span className="flex items-center gap-1">
                        {isCrit ? (
                          <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-red-400" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                        )}
                        <span className={isCrit ? 'text-red-200' : 'text-amber-200'}>
                          {alert.title}
                        </span>
                      </span>
                      {alert.valueText && (
                        <span className="shrink-0 rounded bg-slate-950/80 px-1.5 py-0.5 font-mono text-[10px]">
                          {alert.valueText}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-300">
                      <span className="text-slate-400">受損組織：</span>
                      {alert.tissue}
                    </div>
                    <div className="text-[11px] text-slate-300">
                      <span className="text-slate-400">致傷機制：</span>
                      {alert.mechanism}
                    </div>
                    <div className="text-[11px] text-sky-300">
                      <span className="text-sky-400">修正建議：</span>
                      {alert.recommendation}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="space-y-1.5 border-t border-slate-800 pt-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
              <Activity className="h-3.5 w-3.5 text-emerald-400" />
              雙側肌束伸長率監測
            </div>
            <div className="space-y-1">
              {muscles.map((m) => {
                const pct = (m.strain * 100).toFixed(1);
                const badgeClass =
                  m.status === 'critical'
                    ? 'bg-red-500/20 text-red-300 border-red-500/40'
                    : m.status === 'warning'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-lg bg-slate-900/60 px-2.5 py-1 text-[11px]"
                  >
                    <span className="text-slate-300">{m.nameZh}</span>
                    <span className={`rounded border px-1.5 py-0.5 font-mono ${badgeClass}`}>
                      {m.strain >= 0 ? `+${pct}%` : `${pct}%`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* 手機版 (< 768px)：底部 48px 收合列 / 42vh 展開抽屜 */}
      <div
        data-testid="inspector-mobile"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 flex flex-col border-t border-slate-800 bg-slate-950/95 backdrop-blur-md shadow-2xl"
      >
        {isOpen ? (
          <div className="flex h-[42vh] flex-col">
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/80 px-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setTab('joints')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer ${
                    tab === 'joints' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-400'
                  }`}
                >
                  關節
                </button>
                <button
                  type="button"
                  onClick={() => setTab('forces')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer ${
                    tab === 'forces' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-400'
                  }`}
                >
                  外力 ({forces.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTab('risks')}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer ${
                    tab === 'risks' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-400'
                  }`}
                >
                  警報 ({alerts.length})
                  {criticalCount > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 cursor-pointer"
              >
                <ChevronDown className="h-3.5 w-3.5" />
                收起
              </button>
            </div>
            {renderContent()}
          </div>
        ) : (
          <div className="flex h-12 items-center justify-between px-2 gap-1.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => openTab('joints')}
                className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 cursor-pointer"
              >
                <Sliders className="h-3.5 w-3.5 text-sky-400" />
                關節
              </button>
              <button
                type="button"
                onClick={() => openTab('forces')}
                className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 cursor-pointer"
              >
                <ArrowUpRight className="h-3.5 w-3.5 text-red-400" />
                外力
              </button>
              <button
                type="button"
                onClick={() => openTab('risks')}
                className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 cursor-pointer"
              >
                <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
                警報
                {criticalCount > 0 && (
                  <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="flex items-center gap-1 rounded-lg border border-sky-500/50 bg-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-200 cursor-pointer"
            >
              <ChevronUp className="h-3.5 w-3.5" />
              展開控制
            </button>
          </div>
        )}
      </div>

      {/* 桌面版 (≥ 768px)：右側可完全收合面板（預設收合） */}
      <div className="hidden md:block">
        {!isOpen ? (
          <button
            type="button"
            data-testid="desktop-expand-btn"
            onClick={() => setIsOpen(true)}
            className="fixed right-3 bottom-4 z-30 flex items-center gap-1.5 rounded-xl border border-sky-500/40 bg-slate-950/90 px-3.5 py-2 text-xs font-semibold text-sky-200 shadow-2xl backdrop-blur-md hover:bg-slate-900 cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
            展開控制面板
            {criticalCount > 0 && (
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            )}
          </button>
        ) : (
          <aside
            data-testid="inspector-panel"
            className="fixed right-0 top-11 bottom-0 z-30 flex w-[360px] flex-col border-l border-slate-800 bg-slate-950/95 text-slate-200 shadow-2xl backdrop-blur-md"
          >
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/70 px-2 py-1.5">
              <div className="grid grid-cols-3 gap-1 flex-1 mr-2">
                <button
                  type="button"
                  onClick={() => setTab('joints')}
                  className={`rounded-md py-1.5 text-xs font-medium cursor-pointer ${
                    tab === 'joints'
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  關節
                </button>
                <button
                  type="button"
                  onClick={() => setTab('forces')}
                  className={`rounded-md py-1.5 text-xs font-medium cursor-pointer ${
                    tab === 'forces'
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  外力 ({forces.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTab('risks')}
                  className={`flex items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium cursor-pointer ${
                    tab === 'risks'
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  警報 ({alerts.length})
                  {criticalCount > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-0.5 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                收合面板
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            {renderContent()}
          </aside>
        )}
      </div>
    </>
  );
}
