import React, { useRef, useMemo, Suspense, Component } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Center, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

const MODEL_PATH = `${import.meta.env.BASE_URL || '/'}reamarc-logo.glb`;

// Preload model asset immediately for zero latency on mount
useGLTF.preload(MODEL_PATH);

// Animation Timing Constants
const SPIN_REVOLUTIONS = 3;
const TOTAL_ROTATION = SPIN_REVOLUTIONS * Math.PI * 2; // 1080 degrees (6 * PI)
const SPIN_DURATION = 3.0; // Seconds to complete 3 spins
const PAUSE_DURATION = 2.0; // Exact 2-second pause
const CYCLE_DURATION = SPIN_DURATION + PAUSE_DURATION;

/**
 * Inner 3D Model with mesh traversal, purple material, and rotation loop
 */
function LogoMesh() {
  const { scene } = useGLTF(MODEL_PATH);
  const meshRef = useRef(null);
  const elapsedRef = useRef(0);

  // Clone scene to avoid shared-node mutation when multiple logos are rendered
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    // Calibrated to match the original Reamarc vibrant purple-violet branding
    const purpleMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#8B5CF6'),
      roughness: 0.35,
      metalness: 0.1,
      emissive: new THREE.Color('#6D28D9'),
      emissiveIntensity: 0.38,
      side: THREE.DoubleSide,
    });

    clone.traverse((child) => {
      if (child.isMesh) {
        child.material = purpleMaterial;
        // Keep author-defined vertex normals to preserve clean faceted edges
      }
    });

    return clone;
  }, [scene]);

  // Rotation Loop: Spins 3 times (1080 deg), pauses for 2 seconds, repeats continuously
  useFrame((_, delta) => {
    if (!meshRef.current) return;
    // Cap delta to prevent animation jumping if tab was in background
    elapsedRef.current += Math.min(delta, 0.1);

    const cycleTime = elapsedRef.current % CYCLE_DURATION;
    const completedCycles = Math.floor(elapsedRef.current / CYCLE_DURATION);

    let cycleAngle = 0;
    if (cycleTime < SPIN_DURATION) {
      const t = cycleTime / SPIN_DURATION;
      // Smooth cubic easeInOut for fluid spin-up and deceleration into the pause
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      cycleAngle = eased * TOTAL_ROTATION;
    } else {
      // Hold steady at 1080 degrees for exactly 2 seconds
      cycleAngle = TOTAL_ROTATION;
    }

    meshRef.current.rotation.y = completedCycles * TOTAL_ROTATION + cycleAngle;
  });

  return (
    <group ref={meshRef}>
      <Center>
        {/* Rotate by 90 degrees on X-axis so the front face of the model stands upright and directly faces the camera */}
        <primitive object={clonedScene} rotation={[Math.PI / 2, 0, 0]} />
      </Center>
    </group>
  );
}

/**
 * Lightweight instant fallback while 3D WebGL scene is initializing
 */
function LogoFallback({ size }) {
  const LOGO_WEBP = `${import.meta.env.BASE_URL || '/'}reamarc-logo-3d.webp`;
  const LOGO_GIF = `${import.meta.env.BASE_URL || '/'}reamarc-logo-3d.gif`;
  return (
    <div
      style={{ width: size, height: size }}
      className="flex items-center justify-center shrink-0"
    >
      <picture>
        <source srcSet={LOGO_WEBP} type="image/webp" />
        <img
          src={LOGO_GIF}
          alt="Reamarc 3D Logo"
          width={size}
          height={size}
          className="w-full h-full object-contain select-none pointer-events-none"
        />
      </picture>
    </div>
  );
}

/**
 * WebGL Error Boundary to prevent crashes if WebGL context is lost or unavailable
 */
class WebGLErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.warn('WebGL context failed or unavailable, falling back:', error);
  }

  render() {
    if (this.state.hasError) {
      return <LogoFallback size={this.props.size} />;
    }
    return this.props.children;
  }
}

/**
 * Main 3D Logo Component (Pure JavaScript)
 * Strictly contained within its own canvas container with no revolving background
 */
export function ReamarcLogo3D({
  size = 32,
  className = '',
  floatSpeed = 2,
  floatIntensity = 0.5,
}) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`relative flex items-center justify-center shrink-0 overflow-hidden select-none ${className}`}
    >
      <WebGLErrorBoundary size={size}>
        <Suspense fallback={<LogoFallback size={size} />}>
          <Canvas
            gl={{
              antialias: true,
              alpha: true,
              powerPreference: 'high-performance',
              preserveDrawingBuffer: false,
            }}
            dpr={[1, 2]}
            camera={{ position: [0, 0, 4.4], fov: 45 }}
            style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
          >
            {/* Lighting Studio calibrated to match vibrant violet-purple brand tones */}
            <ambientLight intensity={1.4} color="#FFFFFF" />
            <directionalLight position={[-3, 4, 5]} intensity={1.6} color="#FFFFFF" />
            <directionalLight position={[4, 2, 4]} intensity={1.2} color="#DDD6FE" />
            <directionalLight position={[0, -4, 3]} intensity={0.5} color="#A78BFA" />

            {/* Anti-Gravity Floating Wrapper */}
            <Float
              speed={floatSpeed}
              rotationIntensity={0.25}
              floatIntensity={floatIntensity}
              floatingRange={[-0.08, 0.08]}
            >
              <LogoMesh />
            </Float>
          </Canvas>
        </Suspense>
      </WebGLErrorBoundary>
    </div>
  );
}

export default ReamarcLogo3D;

