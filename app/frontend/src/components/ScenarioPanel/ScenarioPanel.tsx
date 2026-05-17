import { useState, useEffect } from 'react';
import WhatIfTab from './WhatIfTab';
import ReportTab from './ReportTab';

type Tab = 'whatifs' | 'report';

interface Scenario {
  id: string;
  name: string;
  description: string;
  active: boolean;
}

interface Props {
  scenarioId: string | null;
  scenarioName: string;
  initialTab?: Tab;
  onSimulate: () => void;
  onLoadScenario: (id: string) => void;
  onNewScenario: () => void;
  onClose: () => void;
}

export default function ScenarioPanel({ scenarioId, scenarioName, initialTab, onSimulate, onLoadScenario, onNewScenario, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab || 'whatifs');
  const [reportFilenames, setReportFilenames] = useState<string[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    fetch('/api/scenarios')
      .then(r => r.json())
      .then(setScenarios)
      .catch(() => {});
  }, [scenarioName]);

  const handleScenarioChange = async (id: string) => {
    if (id === scenarioId) return;
    setLoadingId(id);
    try {
      await fetch('/api/scenarios/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      onLoadScenario(id);
    } catch (e) {
      console.error('Failed to load scenario', e);
    }
    setLoadingId(null);
  };

  const handleRunReport = (filenames: string[]) => {
    setReportFilenames(filenames);
    setActiveTab('report');
  };

  const activeScenario = scenarios.find(s => s.active);

  return (
    <div className="w-[480px] bg-slate-800 border-l border-slate-700 flex flex-col overflow-hidden">
      {/* Panel header with scenario picker */}
      <div className="px-4 py-3 border-b border-slate-700 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <select
              value={activeScenario?.id || ''}
              onChange={e => handleScenarioChange(e.target.value)}
              disabled={loadingId !== null}
              className="flex-1 min-w-0 bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white font-semibold appearance-none cursor-pointer hover:border-slate-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
            >
              {scenarios.length === 0 && (
                <option value="">Loading...</option>
              )}
              {scenarios.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button
              onClick={onNewScenario}
              className="shrink-0 px-2 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-600/50 text-emerald-400 text-xs font-bold rounded transition-colors"
              title="Create new scenario"
            >
              + New
            </button>
          </div>
          <button onClick={onClose} className="shrink-0 ml-2 text-slate-400 hover:text-white text-lg leading-none">&times;</button>
        </div>

        {loadingId && (
          <div className="text-[10px] text-blue-400 mb-2">Loading scenario...</div>
        )}

        {/* Tab bar — only show when a scenario is loaded */}
        {scenarioId && (
          <div className="flex rounded-md overflow-hidden border border-slate-600">
            <button
              onClick={() => setActiveTab('whatifs')}
              className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'whatifs'
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              What-Ifs
            </button>
            <button
              onClick={() => setActiveTab('report')}
              className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'report'
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Report
            </button>
          </div>
        )}
      </div>

      {/* Tab content */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {!scenarioId ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center text-slate-500">
              <div className="text-sm mb-1">No scenario loaded</div>
              <div className="text-xs">Select a scenario above or create a new one</div>
            </div>
          </div>
        ) : activeTab === 'whatifs' ? (
          <WhatIfTab
            scenarioId={scenarioId}
            scenarioName={scenarioName}
            onSimulate={onSimulate}
            onRunReport={handleRunReport}
          />
        ) : (
          <ReportTab scenarioId={scenarioId} scenarioName={scenarioName} initialFilenames={reportFilenames} />
        )}
      </div>
    </div>
  );
}
