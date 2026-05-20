<script lang="ts">
// biome-ignore-all lint/correctness/noUnusedVariables: Svelte lifecycle and template use these bindings.
import { onMount } from "svelte";
import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  WebGLRenderer,
} from "three";
import { calculateSmoothingAlpha, createSensorOrientationQuaternion } from "./orientation-math";
import type { OrientationMessage } from "./protocol";

type Orientation = Pick<OrientationMessage, "pitch" | "roll" | "yaw"> | undefined;

const ORIENTATION_SMOOTHING_SPEED = 12;

interface Props {
  orientation: Orientation;
  safeMode: boolean;
}

let { orientation, safeMode }: Props = $props();

let canvas: HTMLCanvasElement | undefined = $state();
let container: HTMLDivElement | undefined = $state();
let stickModel: Group | undefined;
let targetOrientation = new Quaternion();

$effect(() => {
  if (!orientation) {
    return;
  }

  targetOrientation = createSensorOrientationQuaternion(orientation);
});

$effect(() => {
  if (!stickModel) {
    return;
  }

  stickModel.traverse((object) => {
    if (object instanceof Mesh && object.material instanceof MeshStandardMaterial) {
      object.material.opacity = safeMode ? 0.44 : 1;
      object.material.transparent = safeMode;
    }
  });
});

onMount(() => {
  if (!canvas || !container) {
    return;
  }

  const scene = new Scene();
  scene.background = new Color(0x101418);

  const camera = new PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 1.8, 5.4);
  camera.lookAt(0, 0, 0);

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  scene.add(new AmbientLight(0xffffff, 1.5));

  const keyLight = new DirectionalLight(0xffffff, 2.4);
  keyLight.position.set(2.5, 4, 3);
  scene.add(keyLight);

  const fillLight = new DirectionalLight(0x9bd8ff, 1.3);
  fillLight.position.set(-3, 1.5, -2);
  scene.add(fillLight);

  stickModel = createStickModel();
  stickModel.quaternion.copy(targetOrientation);
  scene.add(stickModel);

  let lastRenderAt = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const deltaSeconds = Math.min(0.1, (now - lastRenderAt) / 1_000);
    lastRenderAt = now;

    stickModel?.quaternion.slerp(
      targetOrientation,
      calculateSmoothingAlpha(deltaSeconds, ORIENTATION_SMOOTHING_SPEED),
    );
    renderer.render(scene, camera);
  });

  let lastWidth = 0;
  let lastHeight = 0;
  let resizeFrame = 0;

  const resizeObserver = new ResizeObserver(([entry]) => {
    const width = Math.max(1, Math.round(entry.contentRect.width));
    const height = Math.max(1, Math.round(entry.contentRect.height));

    if (width === lastWidth && height === lastHeight) {
      return;
    }

    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      lastWidth = width;
      lastHeight = height;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
  });
  resizeObserver.observe(container);

  return () => {
    window.cancelAnimationFrame(resizeFrame);
    resizeObserver.disconnect();
    renderer.setAnimationLoop(null);
    scene.remove(stickModel as Group);
    disposeGroup(stickModel);
    renderer.dispose();
    stickModel = undefined;
  };
});

function createStickModel(): Group {
  const group = new Group();

  const body = new Mesh(
    new BoxGeometry(1.25, 2.4, 0.34),
    new MeshStandardMaterial({ color: 0xf6f7f8, roughness: 0.56, metalness: 0.08 }),
  );
  body.castShadow = true;
  group.add(body);

  const screen = new Mesh(
    new BoxGeometry(0.88, 0.72, 0.04),
    new MeshStandardMaterial({ color: 0x182b35, emissive: 0x0c2935, roughness: 0.34 }),
  );
  screen.position.set(0, 0.44, 0.2);
  group.add(screen);

  const accent = new Mesh(
    new BoxGeometry(0.72, 0.16, 0.05),
    new MeshStandardMaterial({ color: 0xff5d2d, roughness: 0.42 }),
  );
  accent.position.set(0, -0.22, 0.22);
  group.add(accent);

  const button = new Mesh(
    new BoxGeometry(0.34, 0.2, 0.08),
    new MeshStandardMaterial({ color: 0x2a3138, roughness: 0.48 }),
  );
  button.position.set(0, -0.72, 0.24);
  group.add(button);

  const sideButton = new Mesh(
    new BoxGeometry(0.08, 0.5, 0.18),
    new MeshStandardMaterial({ color: 0xffc857, roughness: 0.42 }),
  );
  sideButton.position.set(0.68, -0.12, 0.04);
  group.add(sideButton);

  group.rotation.x = degreesToRadians(8);
  group.rotation.z = degreesToRadians(-6);
  return group;
}

function disposeGroup(group: Group | undefined): void {
  group?.traverse((object) => {
    if (!(object instanceof Mesh)) {
      return;
    }

    object.geometry.dispose();

    if (Array.isArray(object.material)) {
      for (const material of object.material) {
        material.dispose();
      }
      return;
    }

    object.material.dispose();
  });
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
</script>

<div class="orientation-scene" bind:this={container} aria-label="Live stick orientation">
  <canvas bind:this={canvas}></canvas>
</div>
