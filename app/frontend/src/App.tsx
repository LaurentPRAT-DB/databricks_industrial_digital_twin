import { useEffect, useState, useCallback } from 'react';
import { useSimulationReplay } from './hooks/useSimulationReplay';
import FloorPlan from './components/FloorPlan/FloorPlan';
import FloorPlan3D from './components/FloorPlan/FloorPlan3D';
import MachineStatus from './components/MachineStatus/MachineStatus';
import ProductionBoard from './components/ProductionBoard/ProductionBoard';
import EntityList from './components/EntityList/EntityList';
import ScenarioPicker from './components/ScenarioPicker/ScenarioPicker';
import ScenarioPanel from './components/ScenarioPanel/ScenarioPanel';
import PlanBuilder from './components/PlanBuilder/PlanBuilder';
import ProcessInfo from './components/ProcessInfo/ProcessInfo';
import PlaybackBar from './components/PlaybackBar/PlaybackBar';

function App() {
  const sim = useSimulationReplay();
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [showPanel, setShowPanel] = useState(false);
  const [showPlanBuilder, setShowPlanBuilder] = useState(false);

  const handleScenarioLoad = useCallback(async (scenarioId: string) => {
    await sim.loadFrames();
    setShowPlanBuilder(false);
    setShowPanel(true);
  }, [sim.loadFrames]);

  useEffect(() => {
    if (sim.simConfig.name) document.title = sim.simConfig.name;
  }, [sim.simConfig.name]);

  if (sim.isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="text-center">
          <div className="text-lg font-bold mb-2">Loading Simulation...</div>
          <div className="text-sm text-slate-400">Pre-computing all frames</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-4">
          <span className="text-xl font-bold">{sim.simConfig.name || 'Digital Twin'}</span>
          {sim.whatifName && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-600/20 border border-amber-500/40 text-amber-400">
              <span className="text-[10px]">&#9654;</span> {sim.whatifName}
            </span>
          )}
          {!sim.whatifName && (
            <div className="flex items-center gap-2 ml-2">
              {[
                { label: 'Throughput', value: `${sim.metrics.throughput_per_hour}/hr`, color: 'text-emerald-400' },
                { label: 'WIP', value: `${sim.metrics.wip_count}`, color: 'text-blue-400' },
                { label: 'Completed', value: `${sim.metrics.completed}`, color: 'text-amber-400' },
                { label: 'Utilization', value: `${sim.metrics.avg_utilization_pct}%`, color: 'text-purple-400' },
                { label: 'Queue', value: `${sim.metrics.total_queue_depth}`, color: 'text-rose-400' },
                { label: 'Elapsed', value: `${sim.metrics.elapsed_hours}h`, color: 'text-slate-300' },
              ].map(c => (
                <div key={c.label} className="bg-slate-700/50 rounded px-2.5 py-1 text-center w-[72px]">
                  <div className={`text-sm font-bold ${c.color} font-mono leading-tight`}>{c.value}</div>
                  <div className="text-[9px] text-slate-400">{c.label}</div>
                </div>
              ))}
            </div>
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
          <ScenarioPicker
            currentName={sim.simConfig.name}
            onLoad={handleScenarioLoad}
            onNewScenario={() => { setShowPlanBuilder(true); setShowPanel(false); }}
          />
          {sim.scenarioId && (
            <button
              onClick={() => { setShowPanel(!showPanel); if (!showPanel) setShowPlanBuilder(false); }}
              className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
                showPanel
                  ? 'bg-teal-600 border-teal-500 text-white'
                  : 'bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600'
              }`}
            >
              {showPanel ? 'Close Panel' : 'Scenario Panel'}
            </button>
          )}
        </div>
      </header>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Floor plan (center) */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 p-4">
            {viewMode === '2d' ? (
              <FloorPlan entities={sim.entities} resources={sim.resources} paths={sim.paths} locations={sim.locations} />
            ) : (
              <FloorPlan3D entities={sim.entities} resources={sim.resources} paths={sim.paths} locations={sim.locations} />
            )}
          </div>
          <ProcessInfo
            resources={sim.resources}
            locations={sim.locations}
            stateDescriptions={sim.stateDescriptions}
          />
          <PlaybackBar
            isPlaying={sim.isPlaying}
            speed={sim.speed}
            currentFrameIndex={sim.currentFrameIndex}
            totalFrames={sim.totalFrames}
            progressPct={sim.progressPct}
            currentSimTime={sim.currentSimTime}
            elapsedHours={sim.elapsedHours}
            onTogglePlay={sim.togglePlayPause}
            onSeekPercent={sim.seekToPercent}
            onChangeSpeed={sim.changeSpeed}
          />
        </div>

        {/* Right side: either ScenarioPanel or default sidebar */}
        {showPlanBuilder ? (
          <PlanBuilder
            onGenerate={() => { sim.loadFrames(); setShowPlanBuilder(false); setShowPanel(true); }}
            onClose={() => setShowPlanBuilder(false)}
          />
        ) : showPanel && sim.scenarioId ? (
          <ScenarioPanel
            scenarioId={sim.scenarioId}
            scenarioName={sim.simConfig.name}
            onSimulate={() => { sim.loadFrames(); }}
            onClose={() => setShowPanel(false)}
          />
        ) : (
          <div className="w-80 p-4 space-y-4 overflow-y-auto border-l border-slate-700">
            <MachineStatus resources={sim.resources} locations={sim.locations} />
            <EntityList entities={sim.entities} locations={sim.locations} stateDescriptions={sim.stateDescriptions} />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
