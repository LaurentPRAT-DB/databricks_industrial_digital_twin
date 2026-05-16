import { useEntities } from './hooks/useEntities';
import FloorPlan from './components/FloorPlan/FloorPlan';
import MachineStatus from './components/MachineStatus/MachineStatus';
import ProductionBoard from './components/ProductionBoard/ProductionBoard';
import EntityList from './components/EntityList/EntityList';

function App() {
  const { entities, resources, metrics, connected } = useEntities();

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold">Industrial Digital Twin</span>
          <span className="text-sm text-slate-400">3-Station Assembly Line</span>
        </div>
        <div className="flex items-center gap-4">
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
          <FloorPlan entities={entities} resources={resources} />
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
