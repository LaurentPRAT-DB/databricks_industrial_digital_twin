import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

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

interface SavedReport {
  name: string;
  filename: string;
  saved_at: string | null;
  run_count: number;
}

interface Props {
  scenarioId: string;
  scenarioName: string;
  initialFilenames?: string[];
  onToast?: (message: string, type: 'success' | 'error', url?: string) => void;
}

const PARAM_LABELS: Record<string, { label: string; format: (v: number) => string }> = {
  cycle_time_factor: { label: 'Cycle Time', format: v => `${v.toFixed(1)}x` },
  cycle_time_variability: { label: 'Variability', format: v => `${v.toFixed(1)}x` },
  failure_probability: { label: 'Failure Rate', format: v => `${(v * 100).toFixed(1)}%` },
  failure_duration_mean: { label: 'Repair Time', format: v => `${v}s` },
  failure_duration_std: { label: 'Repair Std', format: v => `${v}s` },
  degradation_rate: { label: 'Degradation', format: v => `${v.toFixed(1)} s/hr` },
  quality_defect_rate: { label: 'Defect Rate', format: v => `${(v * 100).toFixed(1)}%` },
};

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
  { key: 'avg_utilization_pct', label: 'Utiliz.', unit: '%', higherIsBetter: true },
  { key: 'wip_count', label: 'WIP', unit: '', higherIsBetter: false },
  { key: 'total_queue_depth', label: 'Queue', unit: '', higherIsBetter: false },
];

export default function ReportTab({ scenarioId, scenarioName, initialFilenames, onToast }: Props) {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const autoRanRef = useRef(false);

  // Save state
  const [reportSuffix, setReportSuffix] = useState('');
  const [saving, setSaving] = useState(false);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);

  // Dirty tracking & saved reports
  const [dirty, setDirty] = useState(false);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [confirmLoad, setConfirmLoad] = useState<string | null>(null);

  const defaultSuffix = useMemo(() => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `Report ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }, [report]);

  const buildReportName = (): string => {
    const suffix = reportSuffix.trim() || defaultSuffix;
    return `${scenarioName} — ${suffix}`;
  };

  const fetchSavedReports = useCallback(async () => {
    try {
      const res = await fetch(`/api/reports/list/${scenarioId}`);
      const data = await res.json();
      setSavedReports(data.items || []);
    } catch { /* ignore */ }
  }, [scenarioId]);

  useEffect(() => { fetchSavedReports(); }, [fetchSavedReports]);

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
      setDirty(true);
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

  const saveReport = useCallback(async (overwrite = false) => {
    if (!report) return;
    setSaving(true);
    setShowOverwriteConfirm(false);
    const name = buildReportName();
    try {
      const res = await fetch('/api/reports/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario_id: scenarioId,
          name,
          report: { baseline: report.baseline, whatifs: report.whatifs, run_count: report.run_count, elapsed_s: report.elapsed_s },
          overwrite,
        }),
      });
      if (res.status === 409) {
        setShowOverwriteConfirm(true);
        setSaving(false);
        return;
      }
      if (res.ok) {
        onToast?.('Report saved', 'success');
        setDirty(false);
        fetchSavedReports();
      } else {
        const err = await res.json();
        onToast?.(err.error || 'Save failed', 'error');
      }
    } catch (e) {
      console.error('Save report failed', e);
      onToast?.('Save failed', 'error');
    }
    setSaving(false);
  }, [report, scenarioId, reportSuffix, scenarioName, defaultSuffix, fetchSavedReports, onToast]);

  const doLoadReport = useCallback(async (filename: string) => {
    setConfirmLoad(null);
    setLoading(true);
    setProgress('Loading saved report...');
    try {
      const res = await fetch(`/api/reports/load/${scenarioId}/${filename}`);
      const data = await res.json();
      if (data.report) {
        setReport({ ...data.report, scenario_id: scenarioId } as ReportData);
        setDirty(false);
        const fullName: string = data.name || '';
        const prefix = scenarioName + ' — ';
        setReportSuffix(fullName.startsWith(prefix) ? fullName.slice(prefix.length) : fullName);
      }
    } catch (e) {
      console.error('Failed to load report', e);
    }
    setLoading(false);
    setProgress('');
  }, [scenarioId, scenarioName]);

  const handleLoadReport = useCallback((filename: string) => {
    if (dirty) {
      setConfirmLoad(filename);
    } else {
      doLoadReport(filename);
    }
  }, [dirty, doLoadReport]);

  const saveAndLoad = useCallback(async () => {
    if (!confirmLoad) return;
    await saveReport(false);
    if (!showOverwriteConfirm) {
      doLoadReport(confirmLoad);
    }
  }, [confirmLoad, saveReport, showOverwriteConfirm, doLoadReport]);

  const discardAndLoad = useCallback(() => {
    if (!confirmLoad) return;
    setDirty(false);
    doLoadReport(confirmLoad);
  }, [confirmLoad, doLoadReport]);

  // Print report
  const [printing, setPrinting] = useState(false);

  const printReport = useCallback(async () => {
    if (!report) return;
    setPrinting(true);
    try {
      const res = await fetch('/api/reports/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario_id: scenarioId,
          scenario_name: scenarioName,
          report: { baseline: report.baseline, whatifs: report.whatifs, run_count: report.run_count, elapsed_s: report.elapsed_s },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const url = `/api/reports/download/${scenarioId}/${data.filename}`;
        onToast?.(`Printed: ${data.filename}`, 'success', url);
      } else {
        onToast?.('Print failed', 'error');
      }
    } catch {
      onToast?.('Print failed', 'error');
    }
    setPrinting(false);
  }, [report, scenarioId, scenarioName, onToast]);

  // Saved reports list component (reused in empty state and after results)
  const savedReportsList = savedReports.length > 0 ? (
    <div>
      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Saved Reports</h4>
      <div className="space-y-1.5">
        {savedReports.map(sr => (
          <button
            key={sr.filename}
            onClick={() => handleLoadReport(sr.filename)}
            className="w-full text-left px-3 py-2 rounded-lg border border-slate-600/50 bg-slate-700/30 hover:bg-slate-700/60 hover:border-purple-500/50 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-white group-hover:text-purple-300 truncate">
                {sr.name}
              </span>
              <span className="text-[9px] text-slate-500 group-hover:text-purple-400 shrink-0 ml-2">
                Load &rarr;
              </span>
            </div>
            <div className="flex gap-3 text-[9px] text-slate-500 mt-0.5">
              {sr.saved_at && <span>{new Date(sr.saved_at).toLocaleString()}</span>}
              <span>{sr.run_count} runs</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  ) : null;

  // Unsaved changes confirmation
  const confirmLoadUI = confirmLoad && (
    <div className="flex items-center gap-2 p-2 bg-amber-900/30 border border-amber-600/50 rounded text-[10px]">
      <span className="text-amber-300 flex-1">Current report is unsaved. Save before loading?</span>
      <button
        onClick={saveAndLoad}
        className="px-2 py-1 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded transition-colors"
      >
        Save & Load
      </button>
      <button
        onClick={discardAndLoad}
        className="px-2 py-1 bg-slate-600 hover:bg-slate-500 text-slate-200 font-bold rounded transition-colors"
      >
        Discard
      </button>
      <button
        onClick={() => setConfirmLoad(null)}
        className="px-2 py-1 bg-slate-600 hover:bg-slate-500 text-slate-200 font-bold rounded transition-colors"
      >
        Cancel
      </button>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {!report && !loading && (
        <div className="space-y-6">
          <div className="text-center py-8">
            <p className="text-sm text-slate-400 mb-4">
              Select what-ifs in the What-Ifs tab and click "Run Report", or run all below.
            </p>
            <button
              onClick={() => runReport()}
              className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold rounded transition-colors uppercase tracking-wide"
            >
              Run All
            </button>
          </div>
          {confirmLoadUI}
          {savedReportsList}
        </div>
      )}

      {loading && (
        <div className="text-center py-8">
          <div className="inline-block w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-slate-400">{progress}</p>
        </div>
      )}

      {report && !loading && (
        <div className="space-y-4">
          {/* Report header */}
          <div className="bg-slate-700/40 rounded-lg p-3 border border-slate-600/50">
            <h3 className="text-xs font-bold text-white uppercase tracking-wide mb-1">
              {scenarioName}
            </h3>
            <div className="flex items-center gap-3 text-[10px] text-slate-400">
              <span>{report.run_count} runs</span>
              <span>{report.elapsed_s}s elapsed</span>
              <span>Baseline + {report.whatifs.length} what-if{report.whatifs.length !== 1 ? 's' : ''}</span>
              {dirty && <span className="text-amber-400 font-bold">Unsaved</span>}
            </div>
          </div>

          {/* KPI Comparison Table */}
          <div>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">KPI Comparison</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-2 px-2 text-slate-400 font-medium">Run</th>
                    {COLUMNS.map(c => (
                      <th key={c.key} className="text-right py-2 px-2 text-slate-400 font-medium">{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Baseline row */}
                  <tr className="border-b border-slate-700/50 bg-slate-700/30">
                    <td className="py-2 px-2 font-bold text-white">Baseline</td>
                    {COLUMNS.map(c => (
                      <td key={c.key} className="py-2 px-2 text-right font-mono text-white">
                        {report.baseline.metrics[c.key]}{c.unit}
                      </td>
                    ))}
                  </tr>

                  {/* What-if rows */}
                  {report.whatifs.map((wi, i) => (
                    <tr key={i} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                      <td className="py-2 px-2">
                        <div className="text-amber-400 font-medium truncate max-w-[120px]" title={wi.name}>{wi.name}</div>
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
                        No what-ifs included in this report.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Deviation Details per What-If */}
          {report.whatifs.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Deviation Details</h4>
              <div className="space-y-2">
                {report.whatifs.map((wi, i) => {
                  const overrides = wi.overrides || {};
                  const machines = Object.entries(overrides).filter(([, params]) => Object.keys(params).length > 0);
                  return (
                    <div key={i} className="bg-slate-750 border border-slate-600/50 rounded-lg overflow-hidden">
                      <div className="px-3 py-2 bg-slate-700/40 border-b border-slate-600/30 flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-400">{wi.name}</span>
                        <span className="text-[10px] text-slate-500">{machines.length} machine{machines.length !== 1 ? 's' : ''} affected</span>
                      </div>
                      {machines.length === 0 ? (
                        <div className="px-3 py-2 text-[10px] text-slate-500">No deviations — same as baseline</div>
                      ) : (
                        <div className="px-3 py-2 space-y-1.5">
                          {machines.map(([locId, params]) => (
                            <div key={locId} className="flex items-start gap-2">
                              <span className="text-[10px] text-slate-300 font-medium capitalize shrink-0 w-24 truncate" title={locId.replace(/_/g, ' ')}>
                                {locId.replace(/_/g, ' ')}
                              </span>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                {Object.entries(params).map(([key, value]) => {
                                  const info = PARAM_LABELS[key];
                                  if (!info) return null;
                                  return (
                                    <span key={key} className="text-[10px]">
                                      <span className="text-slate-500">{info.label}:</span>{' '}
                                      <span className="text-amber-300 font-mono">{info.format(value)}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Save report */}
          <div className="bg-slate-700/40 rounded-lg p-3 border border-slate-600/50 space-y-2">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Save Report</h4>
            <div className="flex items-center gap-0 bg-slate-700 border border-slate-600 rounded overflow-hidden">
              <span className="px-2 py-1.5 text-[10px] text-slate-400 bg-slate-700/80 border-r border-slate-600 shrink-0 whitespace-nowrap">
                {scenarioName} —
              </span>
              <input
                type="text"
                value={reportSuffix}
                onChange={e => setReportSuffix(e.target.value)}
                placeholder={defaultSuffix}
                className="flex-1 px-2 py-1.5 bg-slate-700 text-[11px] text-white placeholder-slate-500 focus:outline-none min-w-0"
              />
            </div>
            {showOverwriteConfirm && (
              <div className="flex items-center gap-2 p-2 bg-amber-900/30 border border-amber-600/50 rounded text-[10px]">
                <span className="text-amber-300 flex-1">A report with this name already exists. Overwrite?</span>
                <button
                  onClick={() => saveReport(true)}
                  className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded transition-colors"
                >
                  Yes
                </button>
                <button
                  onClick={() => setShowOverwriteConfirm(false)}
                  className="px-2 py-1 bg-slate-600 hover:bg-slate-500 text-slate-200 font-bold rounded transition-colors"
                >
                  No
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => saveReport(false)}
                disabled={saving}
                className="flex-1 py-1.5 text-[10px] font-bold rounded transition-colors uppercase tracking-wide bg-purple-600 hover:bg-purple-500 disabled:bg-slate-600 text-white"
              >
                {saving ? 'Saving...' : 'Save Report'}
              </button>
              <button
                onClick={printReport}
                disabled={printing}
                className="px-3 py-1.5 text-[10px] font-bold rounded transition-colors bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white"
                title="Export as Markdown file"
              >
                {printing ? '...' : 'Print'}
              </button>
              <button
                onClick={() => runReport()}
                className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-slate-300 text-[10px] font-medium rounded transition-colors"
              >
                Re-run
              </button>
            </div>
          </div>

          {/* Unsaved changes confirmation */}
          {confirmLoadUI}

          {/* Saved Reports */}
          {savedReportsList}
        </div>
      )}
    </div>
  );
}
