export interface TemplateStation {
  name: string;
  cycle_mean: number;
  cycle_std: number;
  model_3d: string;
}

export interface IndustryTemplate {
  id: string;
  name: string;
  description: string;
  entity_type: string;
  entity_variants: string[];
  spawn_rate: number;
  stations: TemplateStation[];
}

export const INDUSTRY_TEMPLATES: IndustryTemplate[] = [
  {
    id: 'automotive_body_shop',
    name: 'Automotive Body Shop',
    description: 'Stamping → Welding → Painting → Trim Assembly → Final Assembly → QC',
    entity_type: 'vehicle_body',
    entity_variants: ['sedan', 'suv', 'coupe'],
    spawn_rate: 12,
    stations: [
      { name: 'Stamping', cycle_mean: 45, cycle_std: 5, model_3d: 'machine_heavy' },
      { name: 'Welding', cycle_mean: 120, cycle_std: 15, model_3d: 'robot_arm' },
      { name: 'Painting', cycle_mean: 300, cycle_std: 30, model_3d: 'robot_arm' },
      { name: 'Trim Assembly', cycle_mean: 180, cycle_std: 20, model_3d: 'machine_bed' },
      { name: 'Final Assembly', cycle_mean: 240, cycle_std: 25, model_3d: 'machine_bed' },
      { name: 'Quality Check', cycle_mean: 60, cycle_std: 10, model_3d: 'scanner' },
    ],
  },
  {
    id: 'pharma_tablets',
    name: 'Pharmaceutical Tablets',
    description: 'Feeding → Blending → Milling → Granulation → Press → Coating → QC',
    entity_type: 'tablet_batch',
    entity_variants: ['analgesic', 'antibiotic', 'vitamin'],
    spawn_rate: 200,
    stations: [
      { name: 'Powder Feeding', cycle_mean: 10, cycle_std: 1, model_3d: 'hopper' },
      { name: 'Blending', cycle_mean: 30, cycle_std: 3, model_3d: 'machine_window' },
      { name: 'Milling', cycle_mean: 20, cycle_std: 2, model_3d: 'machine_heavy' },
      { name: 'Granulation', cycle_mean: 45, cycle_std: 5, model_3d: 'machine_window' },
      { name: 'Tablet Press', cycle_mean: 8, cycle_std: 1, model_3d: 'piston' },
      { name: 'Coating', cycle_mean: 60, cycle_std: 8, model_3d: 'robot_arm' },
      { name: 'QC Inspection', cycle_mean: 15, cycle_std: 2, model_3d: 'scanner' },
    ],
  },
  {
    id: 'food_dairy',
    name: 'Food Processing (Dairy)',
    description: 'Receiving → Pasteurization → Homogenization → Filling → Sealing → Labeling → Cold Storage',
    entity_type: 'milk_carton',
    entity_variants: ['whole_milk', 'skim_milk', 'cream'],
    spawn_rate: 150,
    stations: [
      { name: 'Receiving', cycle_mean: 5, cycle_std: 1, model_3d: 'hopper' },
      { name: 'Pasteurization', cycle_mean: 30, cycle_std: 3, model_3d: 'machine_window' },
      { name: 'Homogenization', cycle_mean: 20, cycle_std: 2, model_3d: 'machine_heavy' },
      { name: 'Filling', cycle_mean: 8, cycle_std: 1, model_3d: 'machine_window' },
      { name: 'Sealing', cycle_mean: 5, cycle_std: 0.5, model_3d: 'piston' },
      { name: 'Labeling', cycle_mean: 4, cycle_std: 0.5, model_3d: 'machine_bed' },
      { name: 'Cold Storage', cycle_mean: 10, cycle_std: 1, model_3d: 'machine_window' },
    ],
  },
  {
    id: 'semiconductor_fab',
    name: 'Semiconductor Fab',
    description: 'Clean → Oxidation → Lithography → Etching → Doping → Metallization → Test',
    entity_type: 'wafer',
    entity_variants: ['logic_chip', 'memory_chip', 'analog_ic'],
    spawn_rate: 8,
    stations: [
      { name: 'Wafer Clean', cycle_mean: 120, cycle_std: 10, model_3d: 'machine_window' },
      { name: 'Oxidation', cycle_mean: 600, cycle_std: 30, model_3d: 'machine_window' },
      { name: 'Photolithography', cycle_mean: 300, cycle_std: 20, model_3d: 'machine_bed' },
      { name: 'Etching', cycle_mean: 180, cycle_std: 15, model_3d: 'machine_heavy' },
      { name: 'Doping', cycle_mean: 240, cycle_std: 20, model_3d: 'machine_window' },
      { name: 'Metallization', cycle_mean: 150, cycle_std: 10, model_3d: 'robot_arm' },
      { name: 'Testing', cycle_mean: 90, cycle_std: 10, model_3d: 'scanner' },
    ],
  },
  {
    id: 'furniture_assembly',
    name: 'Furniture Assembly',
    description: 'Cutting → Sanding → Drilling → Assembly → Finishing → Packing',
    entity_type: 'furniture_unit',
    entity_variants: ['chair', 'table', 'shelf', 'desk'],
    spawn_rate: 20,
    stations: [
      { name: 'Wood Cutting', cycle_mean: 45, cycle_std: 5, model_3d: 'piston' },
      { name: 'Sanding', cycle_mean: 60, cycle_std: 8, model_3d: 'machine_bed' },
      { name: 'Drilling', cycle_mean: 30, cycle_std: 3, model_3d: 'piston' },
      { name: 'Assembly', cycle_mean: 120, cycle_std: 15, model_3d: 'robot_arm' },
      { name: 'Finishing', cycle_mean: 90, cycle_std: 10, model_3d: 'robot_arm' },
      { name: 'Packing', cycle_mean: 45, cycle_std: 5, model_3d: 'machine_bed' },
    ],
  },
];
