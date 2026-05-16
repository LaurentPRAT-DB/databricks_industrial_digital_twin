import { useEffect, useState } from 'react';
import { useEntities } from './hooks/useEntities';
import FloorPlan from './components/FloorPlan/FloorPlan';
import FloorPlan3D from './components/FloorPlan/FloorPlan3D';
import MachineStatus from './components/MachineStatus/MachineStatus';
import ProductionBoard from './components/ProductionBoard/ProductionBoard';
import EntityList from './components/EntityList/EntityList';
import ScenarioPicker from './components/ScenarioPicker/ScenarioPicker';
import ProcessInfo from './components/ProcessInfo/ProcessInfo';

function App() {
  const { entities, resources, metrics, simConfig, paths, locations, stateDescriptions, connected } = useEntities();
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');

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
          <div className="flex rounded-md overflow-hidden border border-slate-600">
            <button
              onClick={() => setViewMode('2d')}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                viewMode === '2d'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              2D
            </button>
            <button
              onClick={() => setViewMode('3d')}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                viewMode === '3d'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              3D
            </button>
          </div>
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
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 p-4">
            {viewMode === '2d' ? (
              <FloorPlan entities={entities} resources={resources} paths={paths} locations={locations} />
            ) : (
              <FloorPlan3D entities={entities} resources={resources} paths={paths} locations={locations} />
            )}
          </div>
          <ProcessInfo
            resources={resources}
            locations={locations}
            stateDescriptions={stateDescriptions}
            metrics={metrics}
          />
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
