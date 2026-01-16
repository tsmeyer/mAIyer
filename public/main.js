import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import { Conversation } from '@elevenlabs/client';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// --- CONFIG ---
const ELEVENLABS_API_KEY = 'sk_23ecdb027f96e10b22b1b0d818aa39e8966c2fdb731feebf'; 
const AGENT_ID = 'agent_6301kf03t1b2f7e8dtte5dawdask';
const AVATAR_GLB_PATH = 'avatar.glb';
const ANIMS_GLB_PATH = 'animations.glb';

// --- Scene ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111); // Add a subtle dark grey background
const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.4, 2.2);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// Setup Environment for better materials
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

container.appendChild(renderer.domElement);

// Lighting for Presentation
// Ambient light for base illumination
const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
scene.add(ambientLight);

// Key light (Directional)
const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
keyLight.position.set(2, 2, 2);
scene.add(keyLight);

// Fill light (Directional from the other side)
const fillLight = new THREE.DirectionalLight(0xffffff, 1.2);
fillLight.position.set(-2, 1, 1);
scene.add(fillLight);

// Back light (Rim light to make avatar stand out)
const rimLight = new THREE.DirectionalLight(0xffffff, 1.5);
rimLight.position.set(0, 2, -3);
scene.add(rimLight);

// Face probe light (makes eyes and teeth visible)
const faceLight = new THREE.PointLight(0xffffff, 1.0, 5);
faceLight.position.set(0, 1.5, 1);
scene.add(faceLight);

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

// Blink State
let blinkTimer = 0;
let nextBlinkTime = 2 + Math.random() * 3; 
let blinkValue = 0;

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
    const params = new URLSearchParams({ agent_id: AGENT_ID,
                                include_alignment_metadata: true  });
    if (ELEVENLABS_API_KEY) params.set('api_key', ELEVENLABS_API_KEY);
    const signedUrl = `${baseUrl}?${params.toString()}`;

    conversation = await Conversation.startSession({
      signedUrl,
      onConnect: () => {
        updateStatus('Connected');
        const btn = document.getElementById('actionBtn');
        if (btn) {
          btn.textContent = 'Disconnect';
          btn.style.display = 'block';
        }
      },
      onDisconnect: () => {
        updateStatus('Disconnected');
        const btn = document.getElementById('actionBtn');
        if (btn) btn.textContent = 'Reconnect';
        isSpeaking = false;
      },
      onError: (err) => {
        console.error('SDK Error:', err);
        updateStatus('Error encountered');
      },
      onModeChange: ({ mode }) => {
        isSpeaking = (mode === 'speaking');
        updateStatus(mode === 'speaking' ? 'Assistant speaking' : 'Listening');
      },
      onAudioAlignment: (alignment) => {
        console.log('Alignment data:', alignment);
        console.log(isSpeaking)
        // This confirms if eleven is sending the data
        if (alignment && alignment.chars) {
          console.log('--- ALIGNMENT DATA DETECTED ---');
          console.log('Words:', alignment.chars.join(''));
          // Moderate syllable bump
          if (isSpeaking) talkValue = 0.45; 
        }
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

const actionBtn = document.getElementById('actionBtn');
if (actionBtn) {
  actionBtn.addEventListener('click', async () => {
    if (conversation && conversation.status === 'connected') {
      await conversation.endSession();
    } else {
      await startConversation();
    }
  });
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

  // --- Auto-Blink Logic ---
  blinkTimer += delta;
  if (blinkTimer > nextBlinkTime) {
    // 0.2s duration for a blink
    const blinkDuration = 0.15;
    const timeInBlink = blinkTimer - nextBlinkTime;
    
    if (timeInBlink < blinkDuration) {
      // Use a sine wave to smooth the blink (open -> closed -> open)
      blinkValue = Math.sin((timeInBlink / blinkDuration) * Math.PI);
    } else {
      // Blink finished
      blinkValue = 0;
      blinkTimer = 0;
      nextBlinkTime = 2 + Math.random() * 5; // Blink every 2-7 seconds
    }
  }
  setMorphValue('eyeBlinkLeft', blinkValue);
  setMorphValue('eyeBlinkRight', blinkValue);
  // Fallbacks if named differently in shader
  setMorphValue('Blink', blinkValue);
  setMorphValue('vrm_blink', blinkValue);

  // --- Lip-sync Logic ---
  // Base oscillation for talk movement (fallback)
  const baseTalk = isSpeaking ? (Math.abs(Math.sin(performance.now() * 0.015)) * 0.25) : 0;
  
  if (isSpeaking) {
    // Decay the "bump" from alignments, but stay above baseTalk
    talkValue = Math.max(baseTalk, talkValue - delta * 10);
  } else {
    // Smoothly close when finished
    talkValue = Math.max(0, talkValue - delta * 15);
  }
  
  // Set the shapes with careful intensity scaling to prevent "screaming"
  // jawOpen usually moves the teeth + bone
  setMorphValue('jawOpen', talkValue * 0.8); 
  setMorphValue('mouthOpen', talkValue * 0.6);
  setMorphValue('viseme_aa', talkValue * 0.3);
  setMorphValue('vrm_a', talkValue * 0.5);

  renderer.render(scene, camera);
}
animate();
