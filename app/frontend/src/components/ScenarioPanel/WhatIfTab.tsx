import { useState, useEffect, useCallback } from 'react';
import type { LocationParameter, DeviationParams } from '../../types/entity';

interface SavedWhatIf {
  name: string;
  filename: string;
  saved_at: string | null;
}

interface Props {
  scenarioId: string;
  scenarioName: string;
  onSimulate: () => void;
  onRunReport: (filenames: string[]) => void;
}

const SLIDERS: { key: keyof DeviationParams; label: string; min: number; max: number; step: number; format: (v: number) => string }[] = [
  { key: 'cycle_time_factor', label: 'Cycle Time', min: 0.5, max: 3.0, step: 0.1, format: v => `${v.toFixed(1)}x` },
  { key: 'cycle_time_variability', label: 'Variability', min: 0.5, max: 5.0, step: 0.1, format: v => `${v.toFixed(1)}x` },
  { key: 'failure_probability', label: 'Failure Rate', min: 0, max: 0.2, step: 0.005, format: v => `${(v * 100).toFixed(1)}%` },
  { key: 'failure_duration_mean', label: 'Repair Time', min: 60, max: 1800, step: 30, format: v => `${v}s` },
  { key: 'degradation_rate', label: 'Degradation', min: 0, max: 10, step: 0.5, format: v => `${v.toFixed(1)} s/hr` },
  { key: 'quality_defect_rate', label: 'Defect Rate', min: 0, max: 0.3, step: 0.005, format: v => `${(v * 100).toFixed(1)}%` },
];

const PRESETS: { name: string; desc: string; apply: (dev: DeviationParams) => DeviationParams }[] = [
  {
    name: 'Nominal', desc: 'Default behavior',
    apply: () => ({ cycle_time_factor: 1.0, cycle_time_variability: 1.0, failure_probability: 0.0, failure_duration_mean: 300, failure_duration_std: 60, degradation_rate: 0.0, quality_defect_rate: 0.0 }),
  },
  { name: 'Aging', desc: '30% slower, drift +2s/hr, 3% failure', apply: dev => ({ ...dev, cycle_time_factor: 1.3, degradation_rate: 2.0, failure_probability: 0.03 }) },
  { name: 'Quality Issue', desc: '10% defect rework rate', apply: dev => ({ ...dev, quality_defect_rate: 0.1 }) },
  { name: 'Erratic', desc: 'High variability, occasional failures', apply: dev => ({ ...dev, cycle_time_variability: 3.0, failure_probability: 0.05 }) },
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
      if (v !== getDefaultValue(k as keyof DeviationParams)) nonDefault[k] = v;
    }
    if (Object.keys(nonDefault).length > 0) ovr[locId] = nonDefault;
  }
  return ovr;
}

type View = 'list' | 'editor';

export default function WhatIfTab({ scenarioId, scenarioName, onSimulate, onRunReport }: Props) {
  const [view, setView] = useState<View>('list');
  const [items, setItems] = useState<SavedWhatIf[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Editor state
  const [locations, setLocations] = useState<LocationParameter[]>([]);
  const [overrides, setOverrides] = useState<Record<string, DeviationParams>>({});
  const [whatIfSuffix, setWhatIfSuffix] = useState('');
  const [running, setRunning] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);
  const [editorReady, setEditorReady] = useState(false);

  const fetchList = useCallback(async () => {
    if (!scenarioId) return;
    setListLoading(true);
    try {
      const res = await fetch(`/api/whatif/list/${scenarioId}`);
      const data = await res.json();
      setItems(data.items || []);
    } catch { /* ignore */ }
    setListLoading(false);
  }, [scenarioId]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const fetchLocations = useCallback(async (): Promise<LocationParameter[]> => {
    if (!scenarioId) return [];
    try {
      const res = await fetch(`/api/scenarios/${scenarioId}/parameters`);
      const data = await res.json();
      const locs: LocationParameter[] = data.locations || [];
      setLocations(locs);
      return locs;
    } catch { return []; }
  }, [scenarioId]);

  const openNewWhatIf = useCallback(async () => {
    const locs = await fetchLocations();
    const init: Record<string, DeviationParams> = {};
    for (const loc of locs) init[loc.id] = { ...DEFAULT_DEV, ...loc.deviations };
    setOverrides(init);
    setWhatIfSuffix('');
    setEditorReady(true);
    setView('editor');
  }, [fetchLocations]);

  const openExistingWhatIf = useCallback(async (item: SavedWhatIf) => {
    const locs = await fetchLocations();
    try {
      const res = await fetch(`/api/whatif/load/${scenarioId}/${item.filename}`);
      const data = await res.json();
      const init: Record<string, DeviationParams> = {};
      for (const loc of locs) init[loc.id] = { ...DEFAULT_DEV, ...(data.overrides?.[loc.id] || {}) };
      setOverrides(init);
      const fullName: string = data.name || item.name;
      const prefix = scenarioName + ' — ';
      setWhatIfSuffix(fullName.startsWith(prefix) ? fullName.slice(prefix.length) : fullName);
      setEditorReady(true);
      setView('editor');
    } catch (e) {
      console.error('Failed to load what-if', e);
    }
  }, [scenarioId, scenarioName, fetchLocations]);

  const toggleSelection = useCallback((filename: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  }, []);

  const updateParam = useCallback((locId: string, key: keyof DeviationParams, value: number) => {
    setOverrides(prev => ({ ...prev, [locId]: { ...prev[locId], [key]: value } }));
  }, []);

  const applyPreset = useCallback((locId: string, presetIdx: number) => {
    setOverrides(prev => ({ ...prev, [locId]: PRESETS[presetIdx].apply(prev[locId] || DEFAULT_DEV) }));
  }, []);

  const resetAll = useCallback(() => {
    const init: Record<string, DeviationParams> = {};
    for (const loc of locations) init[loc.id] = { ...DEFAULT_DEV };
    setOverrides(init);
  }, [locations]);

  const buildFullName = (): string => {
    const suffix = whatIfSuffix.trim();
    if (suffix) return `${scenarioName} — ${suffix}`;
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${scenarioName} — ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  };

  const runSimulation = useCallback(async () => {
    setRunning(true);
    try {
      const ovr = buildNonDefaultOverrides(overrides);
      const name = buildFullName();
      await fetch('/api/scenarios/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: scenarioId, name, overrides: ovr }),
      });
      onSimulate();
      setView('list');
    } catch (e) {
      console.error('Simulation failed', e);
    }
    setRunning(false);
  }, [scenarioId, overrides, onSimulate, whatIfSuffix, scenarioName]);

  const saveWhatIf = useCallback(async () => {
    const ovr = buildNonDefaultOverrides(overrides);
    const name = buildFullName();
    try {
      await fetch('/api/whatif/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_id: scenarioId, name, overrides: ovr }),
      });
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 1500);
      fetchList();
    } catch (e) {
      console.error('Save failed', e);
    }
  }, [scenarioId, overrides, fetchList, whatIfSuffix, scenarioName]);

  const hasOverrides = Object.entries(overrides).some(([, dev]) =>
    Object.entries(dev).some(([k, v]) => v !== getDefaultValue(k as keyof DeviationParams))
  );

  // ── List view ──
  if (view === 'list') {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Actions bar */}
        <div className="px-4 py-3 border-b border-slate-700/50 shrink-0 flex items-center gap-2">
          <button
            onClick={openNewWhatIf}
            className="flex-1 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded transition-colors uppercase tracking-wide"
          >
            + New What-If
          </button>
          {selected.size > 0 && (
            <button
              onClick={() => onRunReport(Array.from(selected))}
              className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded transition-colors uppercase tracking-wide"
            >
              Run Report ({selected.size})
            </button>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {listLoading && (
            <div className="text-center py-8">
              <div className="inline-block w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!listLoading && items.length === 0 && (
            <div className="text-center py-8">
              <p className="text-xs text-slate-500 mb-1">No saved what-ifs yet.</p>
              <p className="text-[10px] text-slate-600">Create one to explore scenario variations.</p>
            </div>
          )}

          {!listLoading && items.map(item => (
            <div
              key={item.filename}
              className={`flex items-center gap-2 p-3 rounded-lg border transition-colors ${
                selected.has(item.filename)
                  ? 'border-purple-500/50 bg-purple-900/20'
                  : 'border-slate-600 bg-slate-750 hover:border-teal-500/50 hover:bg-slate-700/60'
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(item.filename)}
                onChange={() => toggleSelection(item.filename)}
                className="shrink-0 w-4 h-4 rounded border-slate-500 bg-slate-700 text-purple-500 focus:ring-purple-500 focus:ring-offset-0 cursor-pointer"
              />
              <button
                onClick={() => openExistingWhatIf(item)}
                className="flex-1 text-left group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white group-hover:text-teal-300 transition-colors">
                    {item.name}
                  </span>
                  <span className="text-[10px] text-slate-500 group-hover:text-teal-400 transition-colors">
                    Edit &rarr;
                  </span>
                </div>
                {item.saved_at && (
                  <div className="text-[10px] text-slate-500 mt-1">
                    {new Date(item.saved_at).toLocaleString()}
                  </div>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Editor view ──
  if (!editorReady) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading parameters...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Back to list */}
      <div className="px-4 py-2 border-b border-slate-700/50 shrink-0">
        <button
          onClick={() => { setView('list'); fetchList(); }}
          className="text-xs text-teal-400 hover:text-teal-300 font-medium"
        >
          &larr; Back to What-Ifs
        </button>
      </div>

      {/* What-if name: scenario prefix + editable suffix */}
      <div className="px-4 py-2 border-b border-slate-700/50 shrink-0">
        <div className="flex items-center gap-0 bg-slate-700 border border-slate-600 rounded overflow-hidden">
          <span className="px-3 py-1.5 text-xs text-slate-400 bg-slate-700/80 border-r border-slate-600 shrink-0 whitespace-nowrap">
            {scenarioName} —
          </span>
          <input
            type="text"
            value={whatIfSuffix}
            onChange={e => setWhatIfSuffix(e.target.value)}
            placeholder="(auto-generated)"
            className="flex-1 px-3 py-1.5 bg-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Machine Cards */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {locations.map(loc => (
          <div key={loc.id} className="bg-slate-750 border border-slate-600 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-slate-700/50 border-b border-slate-600/50 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-white">{loc.label}</span>
                {loc.cycle_time_mean && (
                  <span className="text-[10px] text-slate-400 ml-2">{loc.cycle_time_mean}s cycle</span>
                )}
              </div>
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

      {/* Footer actions */}
      <div className="px-4 py-3 border-t border-slate-700 space-y-2 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={saveWhatIf}
            className={`flex-1 py-2 text-xs font-bold rounded transition-colors uppercase tracking-wide ${
              saveFlash ? 'bg-green-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
            }`}
          >
            {saveFlash ? 'Saved!' : 'Save'}
          </button>
          {hasOverrides && (
            <button
              onClick={resetAll}
              className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold rounded transition-colors uppercase tracking-wide"
            >
              Reset
            </button>
          )}
        </div>
        <button
          onClick={runSimulation}
          disabled={running}
          className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white text-xs font-bold rounded transition-colors uppercase tracking-wide"
        >
          {running ? 'Computing...' : 'Run Simulation'}
        </button>
      </div>
    </div>
  );
}
