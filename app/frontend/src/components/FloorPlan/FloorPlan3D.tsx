import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Line, useGLTF } from '@react-three/drei';
import type { Mesh } from 'three';
import type { Entity, Resource, PathSegment, LocationMeta } from '../../types/entity';
import { getEquipmentModel, preloadEquipmentModels } from '../../config/equipmentModels';
import { GLTFEquipment } from './GLTFEquipment';

interface Props {
  entities: Entity[];
  resources: Resource[];
  paths: PathSegment[];
  locations: LocationMeta[];
}

const LOCATION_COLORS: Record<string, string> = {
  machine: '#3b82f6',
  buffer: '#6b7280',
  spawn_point: '#10b981',
  exit_point: '#f59e0b',
};

const FIXED_STATE_COLORS: Record<string, string> = {
  waiting: '#eab308',
  in_transit: '#22c55e',
  done: '#6b7280',
};

const PROCESS_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6'];

function getStateColor(state: string, processStates: string[]): string {
  if (FIXED_STATE_COLORS[state]) return FIXED_STATE_COLORS[state];
  const idx = processStates.indexOf(state);
  return idx >= 0 ? PROCESS_COLORS[idx % PROCESS_COLORS.length] : '#9ca3af';
}

function toWorld(x: number, y: number): [number, number, number] {
  return [x - 50, 0, -(y - 25)];
}

function LocationModel({ resource, label, locations }: { resource: Resource; label: string; locations: LocationMeta[] }) {
  const color = LOCATION_COLORS[resource.type] || '#4b5563';
  const isBusy = resource.status === 'busy';
  const [wx, , wz] = toWorld(resource.x, resource.y);

  const locMeta = useMemo(
    () => locations.find(l => l.id === resource.id),
    [locations, resource.id],
  );
  const modelHint = locMeta?.model_3d;
  const modelConfig = useMemo(
    () => getEquipmentModel(resource.type, modelHint),
    [resource.type, modelHint],
  );

  const yOffset = resource.type === 'machine' ? 1.5 : resource.type === 'buffer' ? 0.5 : 1.0;

  return (
    <group position={[wx, yOffset, wz]}>
      <GLTFEquipment modelConfig={modelConfig} color={color} isBusy={isBusy} />
      <Html position={[0, 2.5, 0]} center distanceFactor={80}>
        <div className="text-[10px] font-semibold text-white bg-slate-900/80 px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none select-none">
          {label}
          {resource.type === 'buffer' && resource.queue_depth > 0 && (
            <span className="ml-1 text-yellow-400">{resource.queue_depth}</span>
          )}
          {resource.type === 'machine' && isBusy && (
            <span className="ml-1 text-blue-400">&#9881;</span>
          )}
        </div>
      </Html>
    </group>
  );
}

function EntitySphere({ entity, processStates }: { entity: Entity; processStates: string[] }) {
  const meshRef = useRef<Mesh>(null);
  const targetPos = useMemo(() => toWorld(entity.x, entity.y), [entity.x, entity.y]);

  useFrame(() => {
    if (!meshRef.current) return;
    const pos = meshRef.current.position;
    pos.x += (targetPos[0] - pos.x) * 0.1;
    pos.y += (0.5 - pos.y) * 0.1;
    pos.z += (targetPos[2] - pos.z) * 0.1;
  });

  const color = getStateColor(entity.state, processStates);

  return (
    <mesh ref={meshRef} position={[targetPos[0], 0.5, targetPos[2]]}>
      <sphereGeometry args={[0.6, 12, 12]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} />
    </mesh>
  );
}

function ConveyorPath({ path }: { path: PathSegment }) {
  const from = toWorld(path.from.x, path.from.y);
  const to = toWorld(path.to.x, path.to.y);
  const points: [number, number, number][] = [
    [from[0], 0.05, from[2]],
    [to[0], 0.05, to[2]],
  ];

  return (
    <Line
      points={points}
      color="#4b5563"
      lineWidth={2}
      dashed
      dashSize={1.5}
      gapSize={0.8}
    />
  );
}

function Scene({ entities, resources, paths, locations }: Props) {
  const labelMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const loc of locations) m.set(loc.id, loc.label);
    return m;
  }, [locations]);

  const processStates = useMemo(() => {
    const seen = new Set<string>();
    for (const e of entities) seen.add(e.state);
    return Array.from(seen).filter(s => !FIXED_STATE_COLORS[s]);
  }, [entities]);

  useEffect(() => {
    const urls = preloadEquipmentModels();
    urls.forEach(url => useGLTF.preload(url));
  }, []);

  return (
    <>
      <ambientLight intensity={0.6} />
      <hemisphereLight args={[0x87ceeb, 0x334455, 0.3]} />
      <directionalLight position={[30, 40, 20]} intensity={0.9} castShadow />
      <directionalLight position={[-20, 30, -10]} intensity={0.3} />

      {/* Floor */}
      <gridHelper args={[120, 60, '#1e293b', '#1e293b']} position={[0, 0, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[120, 70]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>

      {/* Conveyor paths */}
      {paths.map((p, i) => (
        <ConveyorPath key={`path-${i}`} path={p} />
      ))}

      {/* Location models */}
      {resources.map((r) => (
        <LocationModel
          key={r.id}
          resource={r}
          label={labelMap.get(r.id) || r.id.replace(/_/g, ' ')}
          locations={locations}
        />
      ))}

      {/* Entity spheres */}
      {entities.map((e) => (
        <EntitySphere key={e.id} entity={e} processStates={processStates} />
      ))}

      <OrbitControls
        makeDefault
        target={[0, 0, 0]}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={15}
        maxDistance={120}
      />
    </>
  );
}

export default function FloorPlan3D({ entities, resources, paths, locations }: Props) {
  return (
    <div className="w-full h-full rounded-lg overflow-hidden">
      <Canvas
        shadows
        camera={{ position: [0, 50, 45], fov: 50 }}
        gl={{ antialias: true }}
      >
        <Scene
          entities={entities}
          resources={resources}
          paths={paths}
          locations={locations}
        />
      </Canvas>
    </div>
  );
}
