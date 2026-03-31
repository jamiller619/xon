// @ts-nocheck
// Three.js 3D Model Viewer — loaded as a browser ESM bundle via the plugin assets endpoint.
// Imports Three.js and addons from esm.sh CDN at a pinned version.
import * as THREE from 'https://esm.sh/three@0.167.1';
import { OrbitControls } from 'https://esm.sh/three@0.167.1/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://esm.sh/three@0.167.1/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'https://esm.sh/three@0.167.1/examples/jsm/loaders/OBJLoader.js';

/**
 * Plugin render function — called by PluginSlot with (container, props).
 * Returns a cleanup function.
 *
 * @param {HTMLElement} container
 * @param {{ mediaItem?: { id: string; title: string|null; mediaCategory: string|null; libraryId: string|null } }} props
 * @returns {() => void}
 */
export default function render(container, props) {
  const mediaId = props.mediaItem?.id;
  const mediaCategory = props.mediaItem?.mediaCategory;

  // Only activate for 3D Models
  if (mediaCategory !== '3D Models' || !mediaId) {
    return () => {};
  }

  // ── Container styling ──────────────────────────────────────────────────────
  Object.assign(container.style, {
    width: '100%',
    height: '500px',
    position: 'relative',
    background: '#1a1a2e',
    overflow: 'hidden',
    borderRadius: '8px',
    marginTop: '16px',
  });

  // Loading overlay
  const loadingDiv = document.createElement('div');
  loadingDiv.textContent = 'Loading 3D model…';
  Object.assign(loadingDiv.style, {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    color: '#ccc',
    fontFamily: 'sans-serif',
    fontSize: '14px',
    zIndex: '1',
    pointerEvents: 'none',
  });
  container.appendChild(loadingDiv);

  // ── Three.js scene setup ───────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);

  const w = container.clientWidth || 600;
  const h = container.clientHeight || 500;
  const camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 2000);
  camera.position.set(6, 4, 6);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio ?? 1);
  renderer.setSize(w, h);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // ── Orbit controls ─────────────────────────────────────────────────────────
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 0.5;
  controls.maxDistance = 500;

  // ── Lighting ───────────────────────────────────────────────────────────────
  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(8, 12, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 100;
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0x8899ff, 0.4);
  fill.position.set(-6, 2, -6);
  scene.add(fill);

  // ── Grid floor ─────────────────────────────────────────────────────────────
  const grid = new THREE.GridHelper(30, 30, 0x444466, 0x333355);
  scene.add(grid);

  // ── Resize handling ────────────────────────────────────────────────────────
  function onResize() {
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (cw === 0 || ch === 0) return;
    camera.aspect = cw / ch;
    camera.updateProjectionMatrix();
    renderer.setSize(cw, ch);
  }
  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(container);

  // ── Animation loop ─────────────────────────────────────────────────────────
  let animFrameId = 0;
  let destroyed = false;

  function animate() {
    if (destroyed) return;
    animFrameId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  // ── Fit model into view ────────────────────────────────────────────────────
  function fitToView(object) {
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    // Center the model at origin
    object.position.sub(center);

    // Scale so the longest axis is ~4 units
    if (maxDim > 0) {
      const scale = 4 / maxDim;
      object.scale.multiplyScalar(scale);
    }

    // Re-compute bounding box after transform to position grid under the model
    const finalBox = new THREE.Box3().setFromObject(object);
    grid.position.y = finalBox.min.y;

    // Position camera to frame the model nicely
    const dist = 8;
    camera.position.set(dist, dist * 0.6, dist);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
  }

  // ── Load the model ─────────────────────────────────────────────────────────
  async function loadModel() {
    let fileName = '';
    try {
      const res = await fetch(`/api/v1/media/${mediaId}`);
      const item = await res.json();
      fileName = item.fileName ?? item.filePath ?? '';
    } catch {
      loadingDiv.textContent = 'Failed to fetch media details';
      return;
    }

    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    const streamUrl = `/api/v1/media/${mediaId}/stream`;

    if (ext === 'obj') {
      const loader = new OBJLoader();
      loader.load(
        streamUrl,
        (obj) => {
          fitToView(obj);
          scene.add(obj);
          loadingDiv.remove();
        },
        undefined,
        () => {
          loadingDiv.textContent = 'Failed to load OBJ model';
        },
      );
    } else if (ext === 'gltf' || ext === 'glb') {
      const loader = new GLTFLoader();
      loader.load(
        streamUrl,
        (gltf) => {
          fitToView(gltf.scene);
          scene.add(gltf.scene);
          loadingDiv.remove();
        },
        undefined,
        () => {
          loadingDiv.textContent = 'Failed to load glTF/GLB model';
        },
      );
    } else {
      loadingDiv.textContent = `Unsupported 3D format: .${ext || 'unknown'}`;
    }
  }

  loadModel();

  // ── Cleanup ────────────────────────────────────────────────────────────────
  return () => {
    destroyed = true;
    cancelAnimationFrame(animFrameId);
    resizeObserver.disconnect();
    controls.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode) {
      renderer.domElement.remove();
    }
    if (loadingDiv.parentNode) {
      loadingDiv.remove();
    }
    scene.clear();
  };
}
