import { useState, useEffect, useCallback } from 'react';
import type { LocationParameter, DeviationParams } from '../../types/entity';

interface Props {
  scenarioId: string;
  onSimulate: () => void;
  onClose: () => void;
}

interface SliderDef {
  key: keyof DeviationParams;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  format: (v: number) => string;
}

interface SavedWhatIf {
  name: string;
  filename: string;
  saved_at: string | null;
}

const SLIDERS: SliderDef[] = [
  { key: 'cycle_time_factor', label: 'Cycle Time', min: 0.5, max: 3.0, step: 0.1, unit: 'x', format: v => `${v.toFixed(1)}x` },
  { key: 'cycle_time_variability', label: 'Variability', min: 0.5, max: 5.0, step: 0.1, unit: 'x', format: v => `${v.toFixed(1)}x` },
  { key: 'failure_probability', label: 'Failure Rate', min: 0, max: 0.2, step: 0.005, unit: '%', format: v => `${(v * 100).toFixed(1)}%` },
  { key: 'failure_duration_mean', label: 'Repair Time', min: 60, max: 1800, step: 30, unit: 's', format: v => `${v}s` },
  { key: 'degradation_rate', label: 'Degradation', min: 0, max: 10, step: 0.5, unit: 's/hr', format: v => `${v.toFixed(1)} s/hr` },
  { key: 'quality_defect_rate', label: 'Defect Rate', min: 0, max: 0.3, step: 0.005, unit: '%', format: v => `${(v * 100).toFixed(1)}%` },
];

const PRESETS: { name: string; desc: string; apply: (dev: DeviationParams) => DeviationParams }[] = [
  {
    name: 'Nominal',
    desc: 'Default behavior',
    apply: () => ({
      cycle_time_factor: 1.0, cycle_time_variability: 1.0, failure_probability: 0.0,
      failure_duration_mean: 300, failure_duration_std: 60, degradation_rate: 0.0, quality_defect_rate: 0.0,
    }),
  },
  {
    name: 'Aging',
    desc: '30% slower, drift +2s/hr, 3% failure',
    apply: (dev) => ({ ...dev, cycle_time_factor: 1.3, degradation_rate: 2.0, failure_probability: 0.03 }),
  },
  {
    name: 'Quality Issue',
    desc: '10% defect rework rate',
    apply: (dev) => ({ ...dev, quality_defect_rate: 0.1 }),
  },
  {
    name: 'Erratic',
    desc: 'High variability, occasional failures',
    apply: (dev) => ({ ...dev, cycle_time_variability: 3.0, failure_probability: 0.05 }),
  },
];

const DEFAULT_DEV: DeviationParams = {
  cycle_time_factor: 1.0, cycle_time_variability: 1.0, failure_probability: 0.0,
  failure_duration_mean: 300, failure_duration_std: 60, degradation_rate: 0.0, quality_defect_rate: 0.0,
};

function getDefaultValue(key: keyof DeviationParams): number {
  return DEFAULT_DEV[key];
}

function buildNonDefaultOverrides(overrides: Record<string, DeviationParams>): Record<string, Record<string, number>> {
  const ovr: Record<string, Record<string, number>> = {};
  for (const [locId, dev] of Object.entries(overrides)) {
    const nonDefault: Record<string, number> = {};
    for (const [k, v] of Object.entries(dev)) {
      if (v !== getDefaultValue(k as keyof DeviationParams)) {
        nonDefault[k] = v;
      }
    }
    if (Object.keys(nonDefault).length > 0) ovr[locId] = nonDefault;
  }
  return ovr;
}

export default function ScenarioEditor({ scenarioId, onSimulate, onClose }: Props) {
  const [locations, setLocations] = useState<LocationParameter[]>([]);
  const [overrides, setOverrides] = useState<Record<string, DeviationParams>>({});
  const [scenarioName, setScenarioName] = useState('');
  const [running, setRunning] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [savedList, setSavedList] = useState<SavedWhatIf[]>([]);
  const [showLoadMenu, setShowLoadMenu] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);

  const fetchSavedList = useCallback(async () => {
    if (!scenarioId) return;
    try {
      const res = await fetch(`/api/whatif/list/${scenarioId}`);
      const data = await res.json();
      setSavedList(data.items || []);
    } catch { /* ignore */ }
  }, [scenarioId]);

  useEffect(() => {
    if (!scenarioId) return;
    fetch(`/api/scenarios/${scenarioId}/parameters`)
      .then(r => r.json())
      .then(data => {
        setLocations(data.locations || []);
        const init: Record<string, DeviationParams> = {};
        for (const loc of data.locations || []) {
          init[loc.id] = { ...DEFAULT_DEV, ...loc.deviations };
        }
        setOverrides(init);
        setLoaded(true);
      })
      .catch(() => {});
    fetchSavedList();
  }, [scenarioId, fetchSavedList]);

  const updateParam = useCallback((locId: string, key: keyof DeviationParams, value: number) => {
    setOverrides(prev => ({
      ...prev,
      [locId]: { ...prev[locId], [key]: value },
    }));
  }, []);

  const applyPreset = useCallback((locId: string, presetIdx: number) => {
    setOverrides(prev => ({
      ...prev,
      [locId]: PRESETS[presetIdx].apply(prev[locId] || DEFAULT_DEV),
    }));
  }, []);

  const resetAll = useCallback(() => {
    const init: Record<string, DeviationParams> = {};
    for (const loc of locations) {
      init[loc.id] = { ...DEFAULT_DEV };
    }
    setOverrides(init);
  }, [locations]);

  const runSimulation = useCallback(async () => {
    setRunning(true);
    try {
      const ovr = buildNonDefaultOverrides(overrides);
      await fetch('/api/scenarios/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: scenarioId, name: scenarioName, overrides: ovr }),
      });
      onSimulate();
    } catch (e) {
      console.error('Simulation failed', e);
    }
    setRunning(false);
  }, [scenarioId, scenarioName, overrides, onSimulate]);

  const saveWhatIf = useCallback(async () => {
    const ovr = buildNonDefaultOverrides(overrides);
    try {
      await fetch('/api/whatif/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_id: scenarioId, name: scenarioName, overrides: ovr }),
      });
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 1500);
      fetchSavedList();
    } catch (e) {
      console.error('Save failed', e);
    }
  }, [scenarioId, scenarioName, overrides, fetchSavedList]);

  const loadWhatIf = useCallback(async (filename: string) => {
    try {
      const res = await fetch(`/api/whatif/load/${scenarioId}/${filename}`);
      const data = await res.json();
      setScenarioName(data.name || '');
      const init: Record<string, DeviationParams> = {};
      for (const loc of locations) {
        init[loc.id] = { ...DEFAULT_DEV, ...(data.overrides?.[loc.id] || {}) };
      }
      setOverrides(init);
      setShowLoadMenu(false);
    } catch (e) {
      console.error('Load failed', e);
    }
  }, [scenarioId, locations]);

  const hasOverrides = Object.entries(overrides).some(([, dev]) =>
    Object.entries(dev).some(([k, v]) => v !== getDefaultValue(k as keyof DeviationParams))
  );

  if (!loaded) {
    return (
      <div className="w-96 bg-slate-800 border-l border-slate-700 p-4 flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading parameters...</div>
      </div>
    );
  }

  return (
    <div className="w-96 bg-slate-800 border-l border-slate-700 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-sm font-bold text-white uppercase tracking-wide">What-If Editor</h2>
          <p className="text-[10px] text-slate-500 mt-0.5">Configure equipment deviations</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-lg leading-none">&times;</button>
      </div>

      {/* Scenario name */}
      <div className="px-4 py-2 border-b border-slate-700/50 shrink-0">
        <input
          type="text"
          value={scenarioName}
          onChange={e => setScenarioName(e.target.value)}
          placeholder="Name this scenario..."
          className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Machine Cards */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {locations.map(loc => (
          <div key={loc.id} className="bg-slate-750 border border-slate-600 rounded-lg overflow-hidden">
            {/* Machine header */}
            <div className="px-3 py-2 bg-slate-700/50 border-b border-slate-600/50 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-white">{loc.label}</span>
                {loc.cycle_time_mean && (
                  <span className="text-[10px] text-slate-400 ml-2">
                    {loc.cycle_time_mean}s cycle
                  </span>
                )}
              </div>
              {/* Preset buttons */}
              <div className="flex gap-1">
                {PRESETS.map((p, i) => (
                  <button
                    key={p.name}
                    onClick={() => applyPreset(loc.id, i)}
                    className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-slate-600 hover:bg-slate-500 text-slate-300 transition-colors"
                    title={p.desc}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Sliders */}
            <div className="px-3 py-2 space-y-2">
              {SLIDERS.map(s => {
                const val = overrides[loc.id]?.[s.key] ?? getDefaultValue(s.key);
                const isModified = val !== getDefaultValue(s.key);
                return (
                  <div key={s.key} className="flex items-center gap-2">
                    <span className={`text-[10px] w-16 shrink-0 ${isModified ? 'text-amber-400 font-bold' : 'text-slate-400'}`}>
                      {s.label}
                    </span>
                    <input
                      type="range"
                      min={s.min}
                      max={s.max}
                      step={s.step}
                      value={val}
                      onChange={e => updateParam(loc.id, s.key, parseFloat(e.target.value))}
                      className="flex-1 h-1 accent-blue-500 cursor-pointer"
                    />
                    <span className={`text-[10px] w-12 text-right font-mono ${isModified ? 'text-amber-400' : 'text-slate-500'}`}>
                      {s.format(val)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Load menu dropdown (above footer) */}
      {showLoadMenu && (
        <div className="px-4 py-2 border-t border-slate-700/50 bg-slate-750 max-h-40 overflow-y-auto shrink-0">
          {savedList.length === 0 ? (
            <p className="text-[10px] text-slate-500 text-center py-2">No saved scenarios</p>
          ) : (
            <div className="space-y-1">
              {savedList.map(item => (
                <button
                  key={item.filename}
                  onClick={() => loadWhatIf(item.filename)}
                  className="w-full text-left px-2 py-1.5 rounded bg-slate-700 hover:bg-slate-600 transition-colors group"
                >
                  <div className="text-[11px] text-white font-medium">{item.name}</div>
                  {item.saved_at && (
                    <div className="text-[9px] text-slate-500 group-hover:text-slate-400">
                      {new Date(item.saved_at).toLocaleString()}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer actions */}
      <div className="px-4 py-3 border-t border-slate-700 flex items-center gap-2 shrink-0">
        <button
          onClick={runSimulation}
          disabled={running}
          className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white text-xs font-bold rounded transition-colors uppercase tracking-wide"
        >
          {running ? 'Computing...' : 'Run Simulation'}
        </button>
        <button
          onClick={saveWhatIf}
          disabled={!scenarioName.trim()}
          className={`px-3 py-2 text-xs font-medium rounded transition-colors ${
            saveFlash
              ? 'bg-green-600 text-white'
              : 'bg-slate-700 hover:bg-slate-600 text-slate-300 disabled:opacity-40 disabled:hover:bg-slate-700'
          }`}
          title={scenarioName.trim() ? 'Save what-if config' : 'Enter a name first'}
        >
          {saveFlash ? 'Saved!' : 'Save'}
        </button>
        <button
          onClick={() => setShowLoadMenu(!showLoadMenu)}
          className={`px-3 py-2 text-xs font-medium rounded transition-colors ${
            showLoadMenu
              ? 'bg-blue-600 text-white'
              : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
          }`}
          title="Load saved what-if"
        >
          Load
        </button>
        {hasOverrides && (
          <button
            onClick={resetAll}
            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium rounded transition-colors"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
