import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import { Conversation } from '@elevenlabs/client';

// --- CONFIG ---
const ELEVENLABS_API_KEY = 'sk_23ecdb027f96e10b22b1b0d818aa39e8966c2fdb731feebf'; 
const AGENT_ID = 'agent_6301kf03t1b2f7e8dtte5dawdask';
const AVATAR_GLB_PATH = 'avatar.glb';
const ANIMS_GLB_PATH = 'animations.glb';

// --- Scene ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.4, 2.2);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.7);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(0.5, 1, 0.5);
scene.add(dir);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const loader = new GLTFLoader();
const draco = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
loader.setDRACOLoader(draco);
loader.register((parser) => new VRMLoaderPlugin(parser));

let vrm = null;
let mixer = null;
const clock = new THREE.Clock();
const morphRegistry = new Map();

// --- Conversation State ---
let conversation = null;
let isSpeaking = false;
let talkValue = 0;

function setMorphValue(name, value) {
  const entry = morphRegistry.get(name);
  if (!entry) return;
  const { mesh, index } = entry;
  if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = value;
}

async function loadAvatarAndAnims() {
  console.log('Loading avatar...');
  const gltf = await loader.loadAsync(AVATAR_GLB_PATH);
  vrm = gltf.userData.vrm || { scene: gltf.scene };
  scene.add(vrm.scene);

  vrm.scene.traverse((o) => {
    if (o.isMesh && o.morphTargetDictionary) {
      const dict = o.morphTargetDictionary;
      for (const [name, index] of Object.entries(dict)) {
        if (!morphRegistry.has(name)) morphRegistry.set(name, { mesh: o, index });
      }
    }
  });

  mixer = new THREE.AnimationMixer(vrm.scene);
  try {
    const animGltf = await loader.loadAsync(ANIMS_GLB_PATH);
    if (animGltf.animations.length) {
      mixer.clipAction(animGltf.animations[0]).play();
    }
  } catch (e) { console.warn('No animations found'); }
}

function updateStatus(txt) {
  const el = document.getElementById('status');
  if (el) el.textContent = txt;
  console.log('Status:', txt);
}

async function startConversation() {
  try {
    updateStatus('Connecting...');
    
    // Auth for prototype
    const baseUrl = 'wss://api.elevenlabs.io/v1/convai/conversation';
    const params = new URLSearchParams({ agent_id: AGENT_ID });
    if (ELEVENLABS_API_KEY) params.set('api_key', ELEVENLABS_API_KEY);
    const signedUrl = `${baseUrl}?${params.toString()}`;

    conversation = await Conversation.startSession({
      signedUrl,
      onConnect: () => updateStatus('Connected'),
      onDisconnect: () => updateStatus('Disconnected'),
      onError: (err) => {
        console.error('SDK Error:', err);
        updateStatus('Error encountered');
      },
      onModeChange: ({ mode }) => {
        isSpeaking = (mode === 'speaking');
        updateStatus(mode === 'speaking' ? 'Assistant speaking' : 'Listening');
      },
      onMessage: ({ message, source }) => {
        console.log(`[${source}] ${message}`);
      }
    });

  } catch (err) {
    console.error('Failed to start session:', err);
    updateStatus('Failed to connect');
  }
}

const startMainBtn = document.getElementById('startMain');
if (startMainBtn) {
  startMainBtn.addEventListener('click', async () => {
    const overlay = document.getElementById('startOverlay');
    if (overlay) overlay.style.display = 'none';
    await loadAvatarAndAnims();
    await startConversation();
  });
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if (mixer) mixer.update(delta);

  // Simple procedural lip-sync
  const openNames = ['viseme_aa', 'v_aa', 'aa', 'MouthOpen', 'A', 'vrm_a'];
  if (isSpeaking) {
    talkValue = Math.abs(Math.sin(performance.now() * 0.015)) * 0.7;
  } else {
    talkValue = Math.max(0, talkValue - delta * 10);
  }
  for (const name of openNames) setMorphValue(name, talkValue);

  renderer.render(scene, camera);
}
animate();
