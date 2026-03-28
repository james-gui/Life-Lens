// ——————————————————————————————————————
// Config
// ——————————————————————————————————————
var VIDEO_URL = 'assets/video.mp4';

// ——————————————————————————————————————
// Globals
// ——————————————————————————————————————
var camera, scene, renderer;
var videoElement, videoTexture, videoSphere;
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
function loadVideo() {
  return new Promise(function (resolve, reject) {
    videoElement = document.getElementById('video');
    videoElement.src = VIDEO_URL;
    videoElement.loop = true;
    videoElement.playsInline = true;
    videoElement.crossOrigin = 'anonymous';
    videoElement.setAttribute('webkit-playsinline', '');

    // Quest autoplay requires muted — we unmute after first play
    videoElement.muted = true;

    log('Video src set: ' + VIDEO_URL);
    log('Video muted: true (required for Quest autoplay)');

    videoElement.addEventListener('loadstart', function () { log('Video event: loadstart'); });
    videoElement.addEventListener('loadedmetadata', function () {
      log('Video event: loadedmetadata — ' + videoElement.videoWidth + 'x' + videoElement.videoHeight +
        ', duration: ' + videoElement.duration.toFixed(1) + 's');
    });
    videoElement.addEventListener('loadeddata', function () { log('Video event: loadeddata'); });
    videoElement.addEventListener('canplay', function () { log('Video event: canplay'); });
    videoElement.addEventListener('canplaythrough', function () {
      log('Video event: canplaythrough — resolving');
      resolve();
    }, { once: true });
    videoElement.addEventListener('playing', function () { log('Video event: playing'); });
    videoElement.addEventListener('pause', function () { log('Video event: pause'); });
    videoElement.addEventListener('waiting', function () { log('Video event: waiting (buffering)'); });
    videoElement.addEventListener('stalled', function () { log('Video event: stalled'); });
    videoElement.addEventListener('error', function () {
      var err = videoElement.error;
      var msg = err ? 'code=' + err.code + ' msg=' + err.message : 'unknown';
      log('Video ERROR: ' + msg);
      reject(new Error('Video load failed: ' + msg));
    });

    videoElement.load();
  });
}

function createVideoSphere() {
  var geometry = new THREE.SphereGeometry(500, 60, 40);
  geometry.scale(-1, 1, 1); // Invert so faces point inward

  videoTexture = new THREE.VideoTexture(videoElement);
  videoTexture.colorSpace = THREE.SRGBColorSpace;
  videoTexture.minFilter = THREE.LinearFilter;
  videoTexture.magFilter = THREE.LinearFilter;
  videoTexture.generateMipmaps = false;

  var material = new THREE.MeshBasicMaterial({ map: videoTexture });
  videoSphere = new THREE.Mesh(geometry, material);
  scene.add(videoSphere);
  log('Video sphere added to scene');
}

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

function onSelectStart(event) {
  var controller = event.target;
  log('selectstart on controller');

  tempMatrix.identity().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

  var intersects = raycaster.intersectObjects(exitButton.children, true);
  if (intersects.length > 0) {
    log('Exit button hit — ending session');
    endVRSession();
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
  log('Video paused? ' + videoElement.paused);
  log('Video readyState: ' + videoElement.readyState);
  log('Video currentTime: ' + videoElement.currentTime.toFixed(2));
  log('Video muted: ' + videoElement.muted);

  // Unmute now — the "Enter VR" click counts as a user gesture
  if (videoElement) {
    videoElement.muted = false;
    log('Video unmuted');

    var playPromise = videoElement.play();
    if (playPromise) {
      playPromise.then(function () {
        log('Video play() resolved in VR (unmuted)');
      }).catch(function (err) {
        log('Video play() FAILED unmuted: ' + err.message + ' — falling back to muted');
        videoElement.muted = true;
        videoElement.play().then(function () {
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
  frameCount++;

  // Log video state periodically (every 120 frames ~2s)
  if (frameCount % 120 === 0 && videoElement && videoTexture) {
    log('frame=' + frameCount +
      ' | playing=' + !videoElement.paused +
      ' | time=' + videoElement.currentTime.toFixed(1) +
      ' | ready=' + videoElement.readyState +
      ' | inVR=' + isInVR);

    // Force texture update
    videoTexture.needsUpdate = true;
  }

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
  setStatus('Loading video...');

  loadVideo()
    .then(function () {
      createVideoSphere();
      log('Attempting video.play()...');
      return videoElement.play();
    })
    .then(function () {
      overlay.style.display = 'none';
      log('Video playing successfully');
      log('Video size: ' + videoElement.videoWidth + 'x' + videoElement.videoHeight);
      log('Video duration: ' + videoElement.duration.toFixed(1) + 's');
      setStatus('Video playing — enter VR with the button below');
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
