// ——————————————————————————————————————
// Config
// ——————————————————————————————————————
var VIDEO_URL = 'assets/video.mp4';

// ——————————————————————————————————————
// Globals
// ——————————————————————————————————————
var camera, scene, renderer;
var exitButton, exitButtonMaterial;
var exitButton, exitButtonMaterial;
var controllers = [];
var raycaster = new THREE.Raycaster();
var tempMatrix = new THREE.Matrix4();
var isInVR = false;
var logLines = [];
var frameCount = 0;

// DOM refs
var overlay = document.getElementById('overlay');
var startBtn = document.getElementById('start-btn');
var enterVrBtn = document.getElementById('enter-vr');
var statusEl = document.getElementById('status');

// ——————————————————————————————————————
// Logging — visible on-screen + console
// ——————————————————————————————————————
var logEl;
function setupLog() {
  logEl = document.createElement('div');
  logEl.id = 'debug-log';
  logEl.style.cssText = 'position:fixed;top:10px;right:10px;width:400px;max-height:50vh;overflow-y:auto;' +
    'background:rgba(0,0,0,0.85);color:#0f0;font:12px monospace;padding:10px;z-index:9999;' +
    'border:1px solid #0f0;border-radius:4px;pointer-events:none;';
  document.body.appendChild(logEl);
}

function log(msg) {
  var ts = new Date().toLocaleTimeString();
  var line = '[' + ts + '] ' + msg;
  console.log(line);
  logLines.push(line);
  if (logLines.length > 50) logLines.shift();
  if (logEl) logEl.innerHTML = logLines.join('<br>');
}

// ——————————————————————————————————————
// Init
// ——————————————————————————————————————
function init() {
  setupLog();
  log('Initializing...');

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101010);

  camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 1.6, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local');
  document.body.appendChild(renderer.domElement);

  log('Renderer created, XR enabled');

  // XR session lifecycle
  renderer.xr.addEventListener('sessionstart', onSessionStart);
  renderer.xr.addEventListener('sessionend', onSessionEnd);

  // Controllers
  setupControllers();

  // In-VR exit button
  createExitButton();

  // Custom VR button
  setupVRButton();

  window.addEventListener('resize', onWindowResize);

  renderer.setAnimationLoop(animate);
  setStatus('Ready — click "Begin Session"');
  log('Init complete');
}

// ——————————————————————————————————————
// Custom VR Button
// ——————————————————————————————————————
function setupVRButton() {
  if (!navigator.xr) {
    log('ERROR: navigator.xr not available');
    enterVrBtn.textContent = 'WebXR Not Supported';
    enterVrBtn.disabled = true;
    enterVrBtn.style.display = 'block';
    return;
  }

  log('navigator.xr available, checking immersive-vr support...');

  navigator.xr.isSessionSupported('immersive-vr').then(function (supported) {
    log('immersive-vr supported: ' + supported);
    if (!supported) {
      enterVrBtn.textContent = 'VR Not Supported';
      enterVrBtn.disabled = true;
    }
    enterVrBtn.style.display = 'block';
  });

  enterVrBtn.addEventListener('click', function () {
    if (!renderer.xr.isPresenting) {
      log('Requesting immersive-vr session...');
      navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers']
      }).then(function (session) {
        log('XR session obtained, setting on renderer...');
        renderer.xr.setSession(session);
        enterVrBtn.textContent = 'Exit VR';

        session.addEventListener('end', function () {
          log('XR session "end" event fired');
        });
      }).catch(function (err) {
        log('ERROR requesting XR session: ' + err.message);
      });
    } else {
      log('Ending XR session via button...');
      renderer.xr.getSession().end();
    }
  });
}

// ——————————————————————————————————————
// Video Setup
// ——————————————————————————————————————
// Moved entirely to sceneManager.js

// ——————————————————————————————————————
// In-VR Exit Button
// ——————————————————————————————————————
function createExitButton() {
  var group = new THREE.Group();

  var panelGeo = new THREE.PlaneGeometry(0.4, 0.15);

  var canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#cc0000';
  ctx.fillRect(0, 0, 512, 192);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 496, 176);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 72px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EXIT VR', 256, 96);

  var labelTexture = new THREE.CanvasTexture(canvas);
  exitButtonMaterial = new THREE.MeshBasicMaterial({
    map: labelTexture,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
  });
  var panel = new THREE.Mesh(panelGeo, exitButtonMaterial);
  group.add(panel);

  group.position.set(0, 0.8, -1.5);
  group.name = 'exitButton';
  group.visible = false;

  exitButton = group;
  scene.add(exitButton);
}

// ——————————————————————————————————————
// Controllers & Raycasting
// ——————————————————————————————————————
function setupControllers() {
  for (var i = 0; i < 2; i++) {
    var controller = renderer.xr.getController(i);
    controller.addEventListener('selectstart', onSelectStart);
    controller.addEventListener('selectend', onSelectEnd);
    controller.addEventListener('connected', function (event) {
      log('Controller connected: ' + event.data.handedness + ' (' + event.data.targetRayMode + ')');
    });
    scene.add(controller);

    var points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -3)];
    var lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    var lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
    var line = new THREE.Line(lineGeo, lineMat);
    line.visible = false;
    controller.add(line);
    controller.userData.line = line;

    controllers.push(controller);
  }
}

var exitPressStart = 0;
var EXIT_HOLD_TIME = 1000; // Must hold for 1 second to exit

function onSelectStart(event) {
  var controller = event.target;

  tempMatrix.identity().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

  var intersects = raycaster.intersectObjects(exitButton.children, true);
  if (intersects.length > 0) {
    exitPressStart = Date.now();
    log('Exit button press started — hold for 1s to exit');
  }
}

function onSelectEnd(event) {
  if (exitPressStart > 0) {
    var held = Date.now() - exitPressStart;
    exitPressStart = 0;
    if (held >= EXIT_HOLD_TIME) {
      log('Exit button held ' + held + 'ms — ending session');
      endVRSession();
    } else {
      log('Exit button released too early (' + held + 'ms) — ignoring');
    }
  }
}

// ——————————————————————————————————————
// XR Session Lifecycle
// ——————————————————————————————————————
function onSessionStart() {
  isInVR = true;
  overlay.style.display = 'none';
  enterVrBtn.textContent = 'Exit VR';

  exitButton.visible = true;
  controllers.forEach(function (c) {
    if (c.userData.line) c.userData.line.visible = true;
  });

  log('=== XR SESSION STARTED ===');

  // Resume AudioContext in case it was suspended (VR entry is a user gesture)
  if (audioManager.audioContext) audioManager.audioContext.resume();

  // Unmute now — the "Enter VR" click counts as a user gesture
  if (sceneManager.videoElement1) {
    sceneManager.videoElement1.muted = false;
    log('Video unmuted');

    var playPromise = sceneManager.videoElement1.play();
    if (playPromise) {
      playPromise.then(function () {
        log('Video play() resolved in VR (unmuted)');
      }).catch(function (err) {
        log('Video play() FAILED unmuted: ' + err.message + ' — falling back to muted');
        sceneManager.videoElement1.muted = true;
        sceneManager.videoElement1.play().then(function () {
          log('Video play() resolved MUTED (audio unavailable)');
        }).catch(function (err2) {
          log('Video play() STILL FAILED: ' + err2.message);
        });
      });
    }
  }

  setStatus('In VR — point at EXIT VR to leave');
}

function onSessionEnd() {
  isInVR = false;
  enterVrBtn.textContent = 'Enter VR';
  log('=== XR SESSION ENDED ===');

  exitButton.visible = false;
  controllers.forEach(function (c) {
    if (c.userData.line) c.userData.line.visible = false;
  });

  setStatus('VR session ended — click Enter VR to restart');
}

function endVRSession() {
  var session = renderer.xr.getSession();
  if (session) {
    session.end().catch(function (err) {
      log('Error ending XR session: ' + err.message);
    });
  }
}

// ——————————————————————————————————————
// Render Loop
// ——————————————————————————————————————
function animate() {
  try {
  frameCount++;

  // Log video state periodically (every 300 frames ~5s)
  if (frameCount % 300 === 0 && sceneManager.videoElement1) {
    log('frame=' + frameCount +
      ' | playing=' + !sceneManager.videoElement1.paused +
      ' | inVR=' + isInVR);
  }

  sceneManager.update();

  // Highlight exit button on hover
  if (isInVR && exitButton.visible) {
    var hovering = false;
    for (var i = 0; i < controllers.length; i++) {
      var c = controllers[i];
      tempMatrix.identity().extractRotation(c.matrixWorld);
      raycaster.ray.origin.setFromMatrixPosition(c.matrixWorld);
      raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

      var intersects = raycaster.intersectObjects(exitButton.children, true);
      if (intersects.length > 0) {
        hovering = true;
        break;
      }
    }
    exitButtonMaterial.opacity = hovering ? 1.0 : 0.9;
  }

  renderer.render(scene, camera);
  } catch (err) {
    // Prevent JS errors from crashing the XR session
    if (frameCount % 300 === 0) log('animate() error: ' + err.message);
  }
}

// ——————————————————————————————————————
// Helpers
// ——————————————————————————————————————
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function setStatus(msg) {
  statusEl.textContent = msg;
  log('STATUS: ' + msg);
}

// ——————————————————————————————————————
// Startup
// ——————————————————————————————————————
startBtn.addEventListener('click', function () {
  startBtn.disabled = true;
  startBtn.textContent = 'Loading...';
  setStatus('Loading scene...');

  // 1. Initialize scene (loads textures, sets up 360 spheres)
  sceneManager.init(scene)
    .then(function () {
      // 2. Initialize Audio Manager (user gesture allows AudioContext)
      return audioManager.init();
    })
    .then(function () {
      sceneManager.startPlayback();
      // 3. Connect Gemini Live via WebSocket
      return geminiManager.connect();
    })
    .then(function () {
      overlay.style.display = 'none';
      log('Session started successfully');
      setStatus('Session ready — enter VR with the button below');
    })
    .catch(function (err) {
      setStatus('Error: ' + err.message);
      log('STARTUP ERROR: ' + err.message);
      startBtn.textContent = 'Retry';
      startBtn.disabled = false;
      console.error(err);
    });
});

// Boot
init();
