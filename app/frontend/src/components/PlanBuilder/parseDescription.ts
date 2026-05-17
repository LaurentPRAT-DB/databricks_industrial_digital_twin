export interface ParsedStation {
  name: string;
  cycle_mean: number;
  cycle_std: number;
  model_3d: string;
}

const MODEL_HINTS: [RegExp, string][] = [
  [/robot|arm|pick|place/i, 'robot_arm'],
  [/weld|furnace|melt|forge|stamp|press|roll/i, 'machine_heavy'],
  [/oven|cure|pasteur|heat|anneal|fill/i, 'machine_window'],
  [/coat|spray|paint/i, 'robot_arm'],
  [/inspect|scan|aoi|xray|vision|test|qc/i, 'scanner'],
  [/cut|shear|punch|drill/i, 'piston'],
  [/cnc|mill|lathe|grind|print|pack|label/i, 'machine_bed'],
];

function inferModel(name: string): string {
  for (const [pattern, model] of MODEL_HINTS) {
    if (pattern.test(name)) return model;
  }
  return 'machine';
}

export function parseProcessDescription(text: string): ParsedStation[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  let parts: string[];

  if (/^\d+[.)]\s/m.test(trimmed)) {
    const matches = trimmed.match(/^\d+[.)]\s*(.+)$/gm);
    parts = matches ? matches.map(m => m.replace(/^\d+[.)]\s*/, '')) : [];
  } else if (/→|->|>>/.test(trimmed)) {
    parts = trimmed.split(/\s*(?:→|->|>>)\s*/);
  } else {
    parts = trimmed.split(',').map(p => p.trim()).filter(Boolean);
  }

  const stations: ParsedStation[] = [];

  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;

    // Extract name: text before parentheses or before time specs
    let name: string;
    const parenMatch = p.match(/^([^(]+?)(?:\s*\()/);
    if (parenMatch) {
      name = parenMatch[1].trim();
    } else {
      name = p;
    }
    // Strip trailing time from name
    name = name.replace(/\s+\d+(?:\.\d+)?\s*(?:s|sec|seconds?|min|minutes?).*$/i, '').trim();
    name = name.replace(/\s*-\s*$/, '').trim();
    if (!name) continue;

    // Extract mean time
    const meanMatch = p.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|seconds?)/i);
    const cycleMean = meanMatch ? parseFloat(meanMatch[1]) : 60;

    // Extract std
    const stdMatch = p.match(/[σσ]=\s*(\d+(?:\.\d+)?)\s*s?|std\s*=\s*(\d+(?:\.\d+)?)/i);
    const cycleStd = stdMatch
      ? parseFloat(stdMatch[1] || stdMatch[2])
      : cycleMean * 0.1;

    stations.push({
      name,
      cycle_mean: cycleMean,
      cycle_std: Math.round(cycleStd * 10) / 10,
      model_3d: inferModel(name),
    });
  }

  return stations;
}
