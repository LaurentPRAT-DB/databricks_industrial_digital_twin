import { useState, useEffect, useCallback, useRef } from 'react';

interface Metrics {
  throughput_per_hour: number;
  wip_count: number;
  completed: number;
  avg_utilization_pct: number;
  total_queue_depth: number;
  elapsed_hours: number;
}

interface RunResult {
  name: string;
  metrics: Metrics;
  filename?: string;
  overrides?: Record<string, Record<string, number>>;
  saved_at?: string;
}

interface ReportData {
  scenario_id: string;
  baseline: RunResult;
  whatifs: RunResult[];
  run_count: number;
  elapsed_s: number;
}

interface Props {
  scenarioId: string;
  initialFilenames?: string[];
}

function delta(baseline: number, value: number): { pct: number; label: string } {
  if (baseline === 0) return { pct: 0, label: '—' };
  const pct = ((value - baseline) / baseline) * 100;
  const sign = pct > 0 ? '+' : '';
  return { pct, label: `${sign}${pct.toFixed(1)}%` };
}

function DeltaBadge({ baseline, value, higherIsBetter }: { baseline: number; value: number; higherIsBetter: boolean }) {
  const d = delta(baseline, value);
  if (Math.abs(d.pct) < 0.1) return <span className="text-slate-500 text-[10px]">—</span>;
  const isGood = higherIsBetter ? d.pct > 0 : d.pct < 0;
  return (
    <span className={`text-[10px] font-bold ${isGood ? 'text-emerald-400' : 'text-rose-400'}`}>
      {d.label}
    </span>
  );
}

const COLUMNS: { key: keyof Metrics; label: string; unit: string; higherIsBetter: boolean }[] = [
  { key: 'throughput_per_hour', label: 'Throughput', unit: '/hr', higherIsBetter: true },
  { key: 'completed', label: 'Completed', unit: '', higherIsBetter: true },
  { key: 'avg_utilization_pct', label: 'Utilization', unit: '%', higherIsBetter: true },
  { key: 'wip_count', label: 'WIP', unit: '', higherIsBetter: false },
  { key: 'total_queue_depth', label: 'Queue', unit: '', higherIsBetter: false },
];

export default function ReportTab({ scenarioId, initialFilenames }: Props) {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const autoRanRef = useRef(false);

  const runReport = useCallback(async (filenames?: string[]) => {
    setLoading(true);
    setProgress('Running baseline + selected what-ifs...');
    try {
      const body = filenames && filenames.length > 0 ? { filenames } : null;
      const res = await fetch(`/api/scenarios/${scenarioId}/run-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : null,
      });
      const data: ReportData = await res.json();
      setReport(data);
    } catch (e) {
      console.error('Report failed', e);
    }
    setLoading(false);
    setProgress('');
  }, [scenarioId]);

  useEffect(() => {
    if (initialFilenames && initialFilenames.length > 0 && !autoRanRef.current) {
      autoRanRef.current = true;
      runReport(initialFilenames);
    }
  }, [initialFilenames, runReport]);

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {!report && !loading && (
        <div className="text-center py-8">
          <p className="text-sm text-slate-400 mb-4">
            Select what-ifs in the What-Ifs tab and click "Run Report", or run all below.
          </p>
          <button
            onClick={() => runReport()}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded transition-colors uppercase tracking-wide"
          >
            Run All
          </button>
        </div>
      )}

      {loading && (
        <div className="text-center py-8">
          <div className="inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-slate-400">{progress}</p>
        </div>
      )}

      {report && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-[10px] text-slate-500">
            <span>{report.run_count} runs completed in {report.elapsed_s}s</span>
            <button
              onClick={() => runReport()}
              className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
            >
              Re-run All
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-2 px-2 text-slate-400 font-medium">Scenario</th>
                  {COLUMNS.map(c => (
                    <th key={c.key} className="text-right py-2 px-2 text-slate-400 font-medium">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-700/50 bg-slate-700/30">
                  <td className="py-2 px-2 font-bold text-white">Baseline</td>
                  {COLUMNS.map(c => (
                    <td key={c.key} className="py-2 px-2 text-right font-mono text-white">
                      {report.baseline.metrics[c.key]}{c.unit}
                    </td>
                  ))}
                </tr>
                {report.whatifs.map((wi, i) => (
                  <tr key={i} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                    <td className="py-2 px-2">
                      <div className="text-amber-400 font-medium">{wi.name}</div>
                      {wi.saved_at && (
                        <div className="text-[9px] text-slate-500">{new Date(wi.saved_at).toLocaleDateString()}</div>
                      )}
                    </td>
                    {COLUMNS.map(c => (
                      <td key={c.key} className="py-2 px-2 text-right">
                        <div className="font-mono text-slate-200">{wi.metrics[c.key]}{c.unit}</div>
                        <DeltaBadge baseline={report.baseline.metrics[c.key]} value={wi.metrics[c.key]} higherIsBetter={c.higherIsBetter} />
                      </td>
                    ))}
                  </tr>
                ))}
                {report.whatifs.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNS.length + 1} className="py-4 text-center text-slate-500 text-xs">
                      No saved what-if scenarios. Create some in the What-Ifs tab first.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
