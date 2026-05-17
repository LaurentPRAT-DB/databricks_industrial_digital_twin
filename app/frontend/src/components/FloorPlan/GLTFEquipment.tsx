import { useMemo, Suspense, Component, ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { EquipmentModelConfig } from '../../config/equipmentModels';

interface GLTFEquipmentProps {
  modelConfig: EquipmentModelConfig;
  color: string;
  isBusy: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class GLTFErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function GLTFEquipmentInner({ modelConfig, color, isBusy }: GLTFEquipmentProps) {
  const { scene } = useGLTF(modelConfig.url);

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    const baseColor = new THREE.Color(color);

    clone.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const material = (child.material as THREE.MeshStandardMaterial).clone();
        material.color.copy(baseColor);
        material.roughness = 0.6;
        material.metalness = 0.3;

        if (isBusy) {
          material.emissive = baseColor.clone();
          material.emissiveIntensity = 0.4;
        } else {
          material.transparent = true;
          material.opacity = 0.75;
        }

        child.material = material;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    return clone;
  }, [scene, color, isBusy]);

  const { scale, rotationOffset } = modelConfig;

  return (
    <primitive
      object={clonedScene}
      scale={scale}
      rotation={[rotationOffset.x, rotationOffset.y, rotationOffset.z]}
    />
  );
}

function LoadingPlaceholder({ color }: { color: string }) {
  return (
    <mesh>
      <boxGeometry args={[3, 2, 2.5]} />
      <meshStandardMaterial color={color} transparent opacity={0.3} />
    </mesh>
  );
}

function BoxFallback({ color, isBusy }: { color: string; isBusy: boolean }) {
  return (
    <mesh castShadow receiveShadow>
      <boxGeometry args={[4, 2.5, 3]} />
      <meshStandardMaterial
        color={color}
        emissive={isBusy ? color : '#000000'}
        emissiveIntensity={isBusy ? 0.4 : 0}
        transparent={!isBusy}
        opacity={isBusy ? 1 : 0.7}
      />
    </mesh>
  );
}

export function GLTFEquipment(props: GLTFEquipmentProps) {
  const fallback = <BoxFallback color={props.color} isBusy={props.isBusy} />;

  return (
    <GLTFErrorBoundary fallback={fallback}>
      <Suspense fallback={<LoadingPlaceholder color={props.color} />}>
        <GLTFEquipmentInner {...props} />
      </Suspense>
    </GLTFErrorBoundary>
  );
}
