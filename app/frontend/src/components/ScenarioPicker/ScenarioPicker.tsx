import { useState, useEffect, useRef } from 'react';

interface Scenario {
  id: string;
  name: string;
  description: string;
  active: boolean;
}

interface Props {
  currentName: string;
  onLoad?: (scenarioId: string) => void;
  onNewScenario?: () => void;
}

export default function ScenarioPicker({ currentName, onLoad, onNewScenario }: Props) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/scenarios')
      .then(r => r.json())
      .then(setScenarios)
      .catch(() => {});
  }, [currentName]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const loadScenario = async (id: string) => {
    setLoading(id);
    try {
      await fetch('/api/scenarios/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setOpen(false);
      onLoad?.(id);
    } catch (e) {
      console.error('Failed to load scenario', e);
    }
    setLoading(null);
  };

  if (scenarios.length === 0) return null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-200 border border-slate-600 transition-colors"
      >
        Scenarios
      </button>

      {open && (
        <div className="absolute top-full mt-2 right-0 z-50 w-96 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700">
            <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">
              Available Scenarios
            </h3>
          </div>
          <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
            {onNewScenario && (
              <button
                onClick={() => { setOpen(false); onNewScenario(); }}
                className="w-full p-3 rounded-lg border border-dashed border-emerald-600/50 hover:border-emerald-500 hover:bg-emerald-900/20 transition-colors text-left"
              >
                <span className="text-sm font-semibold text-emerald-400">+ New Scenario</span>
                <p className="text-xs text-slate-400 mt-0.5">Create from scratch or template</p>
              </button>
            )}
            {scenarios.map(s => (
              <div
                key={s.id}
                className={`p-4 rounded-lg border transition-colors ${
                  s.active
                    ? 'bg-slate-700/60 border-emerald-600/50'
                    : 'bg-slate-750 border-slate-600 hover:border-slate-500'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{s.name}</span>
                      {s.active && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase bg-emerald-600/30 text-emerald-400 rounded">
                          Running
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{s.description}</p>
                  </div>
                  {!s.active && (
                    <button
                      onClick={() => loadScenario(s.id)}
                      disabled={loading !== null}
                      className="shrink-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white text-xs font-medium rounded transition-colors"
                    >
                      {loading === s.id ? 'Loading...' : 'Load'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
