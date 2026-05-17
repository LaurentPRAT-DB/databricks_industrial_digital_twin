import { useState } from 'react';
import WhatIfTab from './WhatIfTab';
import ReportTab from './ReportTab';

type Tab = 'whatifs' | 'report';

interface Props {
  scenarioId: string;
  scenarioName: string;
  onSimulate: () => void;
  onClose: () => void;
}

export default function ScenarioPanel({ scenarioId, scenarioName, onSimulate, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('whatifs');
  const [reportFilenames, setReportFilenames] = useState<string[]>([]);

  const handleRunReport = (filenames: string[]) => {
    setReportFilenames(filenames);
    setActiveTab('report');
  };

  return (
    <div className="w-[480px] bg-slate-800 border-l border-slate-700 flex flex-col overflow-hidden">
      {/* Panel header */}
      <div className="px-4 py-3 border-b border-slate-700 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-sm font-bold text-white">{scenarioName}</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Scenario workspace</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-lg leading-none">&times;</button>
        </div>

        {/* Tab bar */}
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
      </div>

      {/* Tab content */}
      {activeTab === 'whatifs' && (
        <WhatIfTab
          scenarioId={scenarioId}
          scenarioName={scenarioName}
          onSimulate={onSimulate}
          onRunReport={handleRunReport}
        />
      )}
      {activeTab === 'report' && (
        <ReportTab scenarioId={scenarioId} initialFilenames={reportFilenames} />
      )}
    </div>
  );
}
