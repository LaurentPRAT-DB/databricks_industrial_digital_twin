import { useState, useEffect, useCallback } from 'react';

interface SavedWhatIf {
  name: string;
  filename: string;
  saved_at: string | null;
}

interface Props {
  scenarioId: string;
  scenarioName: string;
  onLoadWhatIf: (name: string, overrides: Record<string, Record<string, number>>) => void;
  onNewWhatIf: () => void;
  onClose: () => void;
}

export default function WhatIfLibrary({ scenarioId, scenarioName, onLoadWhatIf, onNewWhatIf, onClose }: Props) {
  const [items, setItems] = useState<SavedWhatIf[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingFile, setLoadingFile] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    if (!scenarioId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/whatif/list/${scenarioId}`);
      const data = await res.json();
      setItems(data.items || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [scenarioId]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const handleLoad = useCallback(async (item: SavedWhatIf) => {
    setLoadingFile(item.filename);
    try {
      const res = await fetch(`/api/whatif/load/${scenarioId}/${item.filename}`);
      const data = await res.json();
      onLoadWhatIf(data.name || item.name, data.overrides || {});
    } catch (e) {
      console.error('Failed to load what-if', e);
    }
    setLoadingFile(null);
  }, [scenarioId, onLoadWhatIf]);

  return (
    <div className="w-80 bg-slate-800 border-l border-slate-700 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-sm font-bold text-teal-400 uppercase tracking-wide">What-If Library</h2>
          <p className="text-[10px] text-slate-500 mt-0.5">{scenarioName}</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-lg leading-none">&times;</button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading && (
          <div className="text-center py-8">
            <div className="inline-block w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="text-center py-8">
            <p className="text-xs text-slate-500 mb-1">No saved what-ifs yet.</p>
            <p className="text-[10px] text-slate-600">Use the What-If editor to create and save scenarios.</p>
          </div>
        )}

        {!loading && items.map(item => (
          <button
            key={item.filename}
            onClick={() => handleLoad(item)}
            disabled={loadingFile !== null}
            className="w-full text-left p-3 rounded-lg border border-slate-600 bg-slate-750 hover:border-teal-500/50 hover:bg-slate-700/60 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white group-hover:text-teal-300 transition-colors">
                {item.name}
              </span>
              {loadingFile === item.filename ? (
                <span className="text-[10px] text-teal-400">Loading...</span>
              ) : (
                <span className="text-[10px] text-slate-500 group-hover:text-teal-400 transition-colors">
                  Load &rarr;
                </span>
              )}
            </div>
            {item.saved_at && (
              <div className="text-[10px] text-slate-500 mt-1">
                {new Date(item.saved_at).toLocaleString()}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-700 shrink-0">
        <button
          onClick={onNewWhatIf}
          className="w-full py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded transition-colors uppercase tracking-wide"
        >
          + New What-If
        </button>
      </div>
    </div>
  );
}
