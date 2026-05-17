import { useState, useRef, useEffect } from 'react';
import { ALL_MODEL_KEYS, CURATED_MODEL_KEYS } from '../../config/equipmentModels';

interface Props {
  value: string;
  onChange: (key: string) => void;
}

export default function ModelPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = query
    ? ALL_MODEL_KEYS.filter(k => k.includes(query.toLowerCase().replace(/ /g, '-')))
    : ALL_MODEL_KEYS;

  const curated = filtered.filter(k => CURATED_MODEL_KEYS.includes(k.replace(/-/g, '_')));
  const others = filtered.filter(k => !CURATED_MODEL_KEYS.includes(k.replace(/-/g, '_')));

  const select = (key: string) => {
    onChange(key);
    setQuery('');
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    } else if (e.key === 'Enter' && query) {
      const match = filtered[0];
      if (match) select(match);
      else select(query.toLowerCase().replace(/ /g, '-'));
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        value={open ? query : value.replace(/-/g, ' ')}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search models..."
        className="w-full px-1 py-0.5 bg-slate-800 border border-slate-600 rounded text-xs text-white focus:outline-none focus:border-blue-500"
      />
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-600 rounded shadow-xl max-h-48 overflow-y-auto">
          {curated.length > 0 && (
            <>
              <div className="px-2 py-1 text-[9px] text-slate-500 uppercase font-bold sticky top-0 bg-slate-800">Recommended</div>
              {curated.map(k => (
                <button key={k} onClick={() => select(k)} className="w-full text-left px-2 py-1 text-xs text-white hover:bg-blue-600/40 truncate">
                  {k.replace(/-/g, ' ')}
                </button>
              ))}
            </>
          )}
          {others.length > 0 && (
            <>
              <div className="px-2 py-1 text-[9px] text-slate-500 uppercase font-bold sticky top-0 bg-slate-800">All Models</div>
              {others.slice(0, 20).map(k => (
                <button key={k} onClick={() => select(k)} className="w-full text-left px-2 py-1 text-xs text-white hover:bg-blue-600/40 truncate">
                  {k.replace(/-/g, ' ')}
                </button>
              ))}
              {others.length > 20 && (
                <div className="px-2 py-1 text-[10px] text-slate-500 italic">+{others.length - 20} more — type to filter</div>
              )}
            </>
          )}
          {filtered.length === 0 && (
            <div className="px-2 py-2 text-xs text-slate-400 italic">No match — Enter to use "{query}" as custom key</div>
          )}
        </div>
      )}
    </div>
  );
}
