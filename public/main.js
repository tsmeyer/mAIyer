import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import { Conversation } from '@elevenlabs/client';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- CONFIG ---
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
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// Mouse Controls for Rotation
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableZoom = false; // Keep current zoom
controls.enablePan = false;  // Keep focus centered
controls.enableDamping = true;
controls.target.set(0, 1.4, 0); // Rotate around the face/upper body
controls.update();

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
let isMuted = false;

// High-Fidelity Lip Sync State
const visemeQueue = [];
const VISEME_MAP = {
  'a': 'viseme_aa', 'e': 'viseme_ee', 'i': 'viseme_ih', 'o': 'viseme_oh', 'u': 'viseme_ou',
  'm': 'viseme_PP', 'p': 'viseme_PP', 'b': 'viseme_PP',
  'f': 'viseme_FF', 'v': 'viseme_FF',
  't': 'viseme_DD', 'd': 'viseme_DD', 's': 'viseme_DD', 'z': 'viseme_DD',
  'n': 'viseme_DD', 'l': 'viseme_DD', 'r': 'viseme_DD',
  'k': 'viseme_kk', 'g': 'viseme_kk', 'h': 'viseme_kk',
  'j': 'viseme_ch', 's': 'viseme_ch'
};

// Blink State
let blinkTimer = 0;
let nextBlinkTime = 2 + Math.random() * 3; 
let blinkValue = 0;

window.addEventListener('keydown', async (e) => {
  if (!conversation) return;

  if (e.code === 'Space') {
    e.preventDefault();
    isMuted = !isMuted;
    try {
      await conversation.setMicMuted(isMuted);
      updateStatus(isMuted ? 'Muted' : 'Unmuted');
    } catch (err) { console.error('Mute error:', err); }
  }

  // Language Shortcuts
  if (e.key.toLowerCase() === 's') {
    updateStatus('Switching to Spanish...');
    try {
      await conversation.sendUserMessage("Please respond in Spanish from now on.");
    } catch (e) { console.error('Language switch error:', e); }
  }

  if (e.key.toLowerCase() === 'm') {
    updateStatus('Switching to Mandarin...');
    try {
      await conversation.sendUserMessage("Please respond in Mandarin from now on.");
    } catch (e) { console.error('Language switch error:', e); }
  }

  if (e.key.toLowerCase() === 'e') {
    updateStatus('Switching to English...');
    try {
      await conversation.sendUserMessage("Please respond in English from now on.");
    } catch (e) { console.error('Language switch error:', e); }
  }
});

function setMorphValue(name, value) {
  const entries = morphRegistry.get(name);
  if (!entries) return;
  // Apply to ALL meshes that share this morph name
  for (const { mesh, index } of entries) {
    if (mesh.morphTargetInfluences) {
      mesh.morphTargetInfluences[index] = value;
    }
  }
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
        if (!morphRegistry.has(name)) {
          morphRegistry.set(name, []);
        }
        morphRegistry.get(name).push({ mesh: o, index });
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
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    updateStatus('Secure context required');
    alert('Microphone access requires a secure context. Please use localhost:8080.');
    return;
  }

  try {
    updateStatus('Connecting...');
    
    // BACK TO LOCAL SETUP: Use API key directly to skip permission issues
    const API_KEY = 'sk_23ecdb027f96e10b22b1b0d818aa39e8966c2fdb731feebf';

    conversation = await Conversation.startSession({
      apiKey: API_KEY, // Use apiKey directly instead of signedUrl
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
        if (!isSpeaking) {
          visemeQueue.length = 0; // Clear queue when stopped
        }
      },
      onAudioAlignment: (alignment) => {
        if (!alignment || !alignment.chars) return;
        
        console.log('>>> ALIGNMENT DATA RECEIVED:', alignment.chars.join(''));
        
        // Offset everything by current time + a small buffer for network/audio latency
        const startTime = performance.now() + 100; 
        
        alignment.chars.forEach((char, i) => {
          visemeQueue.push({
            char: char.toLowerCase(),
            time: startTime + alignment.charStartTimesMs[i],
            duration: alignment.charDurationsMs[i]
          });
        });
      },
      onMessage: (msg) => {
        // Fallback: If SDK doesn't trigger onAudioAlignment, we check raw message
        if (msg.type === 'audio_alignment' && msg.alignment) {
          console.log('MANUAL ALIGNMENT CAPTURE:', msg.alignment);
          const alignment = msg.alignment;
          const startTime = performance.now() + 100;
          alignment.chars.forEach((char, i) => {
            visemeQueue.push({
              char: char.toLowerCase(),
              time: startTime + alignment.char_start_times_ms[i],
              duration: alignment.char_durations_ms[i]
            });
          });
        }
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
  if (controls) controls.update();

  // --- Auto-Blink Logic ---
  blinkTimer += delta;
  if (blinkTimer > nextBlinkTime) {
    const blinkDuration = 0.15;
    const timeInBlink = blinkTimer - nextBlinkTime;
    if (timeInBlink < blinkDuration) {
      blinkValue = Math.sin((timeInBlink / blinkDuration) * Math.PI);
    } else {
      blinkValue = 0;
      blinkTimer = 0;
      nextBlinkTime = 2 + Math.random() * 5;
    }
  }
  setMorphValue('eyeBlinkLeft', blinkValue);
  setMorphValue('eyeBlinkRight', blinkValue);

  // --- Lip-sync Logic (High Fidelity) ---
  const now = performance.now();
  
  // Clean up the queue
  while (visemeQueue.length > 0 && visemeQueue[0].time + (visemeQueue[0].duration || 50) < now) {
    visemeQueue.shift();
  }

  // Find the viseme intended for RIGHT NOW
  let currentViseme = null;
  if (visemeQueue.length > 0) {
    // If we are within the start time window
    if (now >= visemeQueue[0].time) {
      currentViseme = visemeQueue[0];
    }
  }

  let targetOpen = 0;
  let targetViseme = null;

  if (currentViseme) {
    targetOpen = 0.5; 
    targetViseme = VISEME_MAP[currentViseme.char] || 'viseme_aa';
  } else if (isSpeaking) {
    // FALLBACK: If no alignment data is currently "active" but we know we are speaking
    targetOpen = 0.1 + (Math.abs(Math.sin(now * 0.02)) * 0.2);
    targetViseme = 'viseme_aa';
  }

  // Smoothly interpolate talkValue toward the target
  talkValue = THREE.MathUtils.lerp(talkValue, targetOpen, delta * 20);

  // Reset ALL viseme morphs to 0 before applying the active one
  const allVisemes = [
    'viseme_aa', 'viseme_ee', 'viseme_ih', 'viseme_oh', 'viseme_ou', 
    'viseme_PP', 'viseme_FF', 'viseme_DD', 'viseme_kk', 'viseme_ch'
  ];
  allVisemes.forEach(v => setMorphValue(v, 0));

  // Apply movement
  if (talkValue > 0.01) {
    setMorphValue('jawOpen', talkValue);
    setMorphValue('mouthOpen', talkValue * 0.4);
    if (targetViseme) {
      setMorphValue(targetViseme, talkValue * 0.7);
    }
  } else {
    setMorphValue('jawOpen', 0);
    setMorphValue('mouthOpen', 0);
  }

  renderer.render(scene, camera);
}
animate();
