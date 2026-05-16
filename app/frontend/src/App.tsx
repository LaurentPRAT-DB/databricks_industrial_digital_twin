import { useEffect } from 'react';
import { useEntities } from './hooks/useEntities';
import FloorPlan from './components/FloorPlan/FloorPlan';
import MachineStatus from './components/MachineStatus/MachineStatus';
import ProductionBoard from './components/ProductionBoard/ProductionBoard';
import EntityList from './components/EntityList/EntityList';
import ScenarioPicker from './components/ScenarioPicker/ScenarioPicker';

function App() {
  const { entities, resources, metrics, simConfig, paths, connected } = useEntities();

  useEffect(() => {
    if (simConfig.name) document.title = simConfig.name;
  }, [simConfig.name]);

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold">{simConfig.name || 'Digital Twin'}</span>
          {simConfig.description && (
            <span className="text-sm text-slate-400">{simConfig.description}</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <ScenarioPicker currentName={simConfig.name} />
          <span className="text-sm text-slate-400">
            Sim: {metrics.elapsed_hours}h
          </span>
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
        </div>
      </header>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Floor plan (center) */}
        <div className="flex-1 p-4">
          <FloorPlan entities={entities} resources={resources} paths={paths} />
        </div>

        {/* Sidebar (right) */}
        <div className="w-80 p-4 space-y-4 overflow-y-auto border-l border-slate-700">
          <ProductionBoard metrics={metrics} />
          <MachineStatus resources={resources} />
          <EntityList entities={entities} />
        </div>
      </div>
    </div>
  );
}

export default App;
