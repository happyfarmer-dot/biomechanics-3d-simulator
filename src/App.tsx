import { ErrorBoundary } from './components/ErrorBoundary';
import { SceneCanvas } from './components/scene/SceneCanvas';
import { InspectorPanel } from './components/ui/InspectorPanel';
import { LayerToolbar } from './components/ui/LayerToolbar';
import { MacroHUD } from './components/ui/MacroHUD';
import { TopBar } from './components/ui/TopBar';

export function App() {
  return (
    <ErrorBoundary>
      <div
        translate="no"
        className="notranslate flex h-dvh w-screen flex-col overflow-hidden bg-[#090d16] text-slate-100 select-none"
      >
        <TopBar />
        <main className="relative flex-1 overflow-hidden">
          <SceneCanvas />
          <LayerToolbar />
          <MacroHUD />
          <InspectorPanel />
        </main>
      </div>
    </ErrorBoundary>
  );
}

export default App;
