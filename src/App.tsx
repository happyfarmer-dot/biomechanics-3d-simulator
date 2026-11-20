import { ErrorBoundary } from './components/ErrorBoundary';
import { SceneCanvas } from './components/scene/SceneCanvas';
import { InspectorPanel } from './components/ui/InspectorPanel';
import { LayerToolbar } from './components/ui/LayerToolbar';
import { MacroHUD } from './components/ui/MacroHUD';
import { TopBar } from './components/ui/TopBar';

export function App() {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#090d16] text-slate-100">
      <TopBar />
      <div className="relative flex flex-1 overflow-hidden">
        <main className="relative flex-1 overflow-hidden">
          <ErrorBoundary>
            <SceneCanvas />
          </ErrorBoundary>
          <LayerToolbar />
          <MacroHUD />
        </main>
        <InspectorPanel />
      </div>
    </div>
  );
}

export default App;
