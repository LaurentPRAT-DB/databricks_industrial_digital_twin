import { useState, useCallback } from 'react';
import { INDUSTRY_TEMPLATES, type IndustryTemplate, type TemplateStation } from './templates';
import { parseProcessDescription } from './parseDescription';
import ModelPicker from './ModelPicker';

interface Station {
  name: string;
  cycle_mean: number;
  cycle_std: number;
  model_3d: string;
}

interface Props {
  onGenerate: () => void;
  onClose: () => void;
}

export default function PlanBuilder({ onGenerate, onClose }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [entityType, setEntityType] = useState('part');
  const [variants, setVariants] = useState('');
  const [spawnRate, setSpawnRate] = useState(20);
  const [stations, setStations] = useState<Station[]>([]);
  const [freeText, setFreeText] = useState('');
  const [showFreeText, setShowFreeText] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const applyTemplate = useCallback((template: IndustryTemplate) => {
    setName(template.name);
    setDescription(template.description);
    setEntityType(template.entity_type);
    setVariants(template.entity_variants.join(', '));
    setSpawnRate(template.spawn_rate);
    setStations(template.stations.map(s => ({ ...s })));
  }, []);

  const addStation = () => {
    setStations([...stations, { name: '', cycle_mean: 60, cycle_std: 6, model_3d: 'machine' }]);
  };

  const removeStation = (idx: number) => {
    setStations(stations.filter((_, i) => i !== idx));
  };

  const updateStation = (idx: number, field: keyof Station, value: string | number) => {
    setStations(stations.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const moveStation = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= stations.length) return;
    const arr = [...stations];
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    setStations(arr);
  };

  const parseFreeText = () => {
    const parsed = parseProcessDescription(freeText);
    if (parsed.length === 0) {
      setError('Could not parse any stations from the text');
      return;
    }
    setStations(parsed);
    setError('');
    setShowFreeText(false);
  };

  const generate = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (stations.length === 0) { setError('Add at least one station'); return; }
    if (stations.some(s => !s.name.trim())) { setError('All stations need a name'); return; }

    setError('');
    setGenerating(true);

    try {
      const body = {
        name: name.trim(),
        description: description.trim(),
        duration_hours: 8,
        entity_type: entityType.trim() || 'part',
        entity_variants: variants.split(',').map(v => v.trim()).filter(Boolean),
        spawn_rate_per_hour: spawnRate,
        stations: stations.map(s => ({
          name: s.name,
          cycle_mean: s.cycle_mean,
          cycle_std: s.cycle_std,
          model_3d: s.model_3d,
        })),
      };

      const res = await fetch('/api/scenarios/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Generation failed');
        return;
      }

      onGenerate();
    } catch (e) {
      setError('Network error');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="w-80 border-l border-slate-700 bg-slate-800 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-200">New Scenario</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-lg leading-none">&times;</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Template picker */}
        <section>
          <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">Industry Template</label>
          <div className="grid grid-cols-1 gap-1.5">
            {INDUSTRY_TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => applyTemplate(t)}
                className="p-2 text-left rounded border border-slate-600 hover:border-blue-500 hover:bg-slate-700/50 transition-colors"
              >
                <div className="text-xs font-semibold text-white truncate">{t.name}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{t.stations.length} stations</div>
              </button>
            ))}
            <button
              onClick={() => { setStations([]); setName(''); setDescription(''); }}
              className="p-2 text-left rounded border border-dashed border-slate-600 hover:border-blue-500 hover:bg-slate-700/50 transition-colors"
            >
              <div className="text-xs font-semibold text-slate-300">Custom</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Start blank</div>
            </button>
          </div>
        </section>

        {/* Metadata */}
        <section className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="My Assembly Line"
              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-600 rounded text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Description</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Station A → Station B → ..."
              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-600 rounded text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-400 mb-1">Entity Type</label>
              <input
                value={entityType}
                onChange={e => setEntityType(e.target.value)}
                placeholder="part"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-600 rounded text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="w-24">
              <label className="block text-xs font-semibold text-slate-400 mb-1">Rate/hr</label>
              <input
                type="number"
                value={spawnRate}
                onChange={e => setSpawnRate(Number(e.target.value))}
                min={1}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Variants (comma-separated)</label>
            <input
              value={variants}
              onChange={e => setVariants(e.target.value)}
              placeholder="type_a, type_b, type_c"
              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-600 rounded text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>
        </section>

        {/* Free-text import */}
        <section>
          <button
            onClick={() => setShowFreeText(!showFreeText)}
            className="text-xs text-blue-400 hover:text-blue-300 font-medium"
          >
            {showFreeText ? 'Hide' : 'Import from text description...'}
          </button>
          {showFreeText && (
            <div className="mt-2 space-y-2">
              <textarea
                value={freeText}
                onChange={e => setFreeText(e.target.value)}
                rows={4}
                placeholder="Stamping (60s) → Welding (120s, σ=15s) → Painting (300s) → QC (45s)"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-sm text-white placeholder:text-slate-400 font-mono focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={parseFreeText}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded transition-colors"
              >
                Parse
              </button>
            </div>
          )}
        </section>

        {/* Station list */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-slate-400 uppercase">Stations ({stations.length})</label>
          </div>
          <div className="space-y-2">
            {stations.map((s, i) => (
              <div key={i} className="p-3 bg-slate-900/60 rounded border border-slate-700">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] text-slate-500 font-mono w-4">{i + 1}</span>
                  <input
                    value={s.name}
                    onChange={e => updateStation(i, 'name', e.target.value)}
                    placeholder="Station name"
                    className="flex-1 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                  <button onClick={() => moveStation(i, -1)} disabled={i === 0} className="text-slate-500 hover:text-white disabled:opacity-30 text-xs">&#9650;</button>
                  <button onClick={() => moveStation(i, 1)} disabled={i === stations.length - 1} className="text-slate-500 hover:text-white disabled:opacity-30 text-xs">&#9660;</button>
                  <button onClick={() => removeStation(i)} className="text-red-400 hover:text-red-300 text-xs">&#10005;</button>
                </div>
                <div className="flex gap-2 pl-6">
                  <div className="flex-1">
                    <label className="text-[10px] text-slate-500">Mean (s)</label>
                    <input
                      type="number"
                      value={s.cycle_mean}
                      onChange={e => updateStation(i, 'cycle_mean', Number(e.target.value))}
                      min={1}
                      className="w-full px-2 py-0.5 bg-slate-800 border border-slate-600 rounded text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-slate-500">Std (s)</label>
                    <input
                      type="number"
                      value={s.cycle_std}
                      onChange={e => updateStation(i, 'cycle_std', Number(e.target.value))}
                      min={0}
                      step={0.1}
                      className="w-full px-2 py-0.5 bg-slate-800 border border-slate-600 rounded text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-slate-500">Model</label>
                    <ModelPicker
                      value={s.model_3d}
                      onChange={v => updateStation(i, 'model_3d', v)}
                    />
                  </div>
                </div>
              </div>
            ))}
            {stations.length === 0 && (
              <div className="text-center py-6 text-slate-500 text-xs">
                Pick a template or add stations manually
              </div>
            )}
            <button
              onClick={addStation}
              className="w-full py-2 mt-1 rounded border border-dashed border-slate-600 text-xs text-blue-400 hover:text-blue-300 hover:border-blue-500 font-medium transition-colors"
            >
              + Add Station
            </button>
          </div>
        </section>

        {/* Preview */}
        {stations.length > 0 && (
          <section className="p-3 bg-slate-900/40 rounded border border-slate-700">
            <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Preview</div>
            <div className="text-xs text-slate-300">
              {stations.map(s => s.name || '?').join(' → ')}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              {stations.length} stations, ~{spawnRate}/hr, entity: {entityType}
            </div>
          </section>
        )}

        {/* Error */}
        {error && (
          <div className="px-3 py-2 bg-red-900/30 border border-red-700 rounded text-xs text-red-300">
            {error}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-700">
        <button
          onClick={generate}
          disabled={generating || stations.length === 0}
          className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-semibold rounded transition-colors"
        >
          {generating ? 'Generating...' : 'Generate & Run'}
        </button>
      </div>
    </div>
  );
}
