class SceneManager {
  constructor() {
    this.videoElement1 = null;
    this.videoElement2 = null;
    this.videoTexture1 = null;
    this.videoTexture2 = null;
    this.videoSphere1 = null;
    this.videoSphere2 = null;
    this.currentSphere = 1;
    this.isFading = false;
  }

  init(scene) {
    this.scene = scene;
    this.videoElement1 = document.createElement('video');
    this.setupVideoElement(this.videoElement1);
    this.videoElement1.src = 'assets/meadow.mp4';

    this.videoElement2 = document.createElement('video');
    this.setupVideoElement(this.videoElement2);

    this.videoTexture1 = new THREE.VideoTexture(this.videoElement1);
    this.setupTexture(this.videoTexture1);

    this.videoTexture2 = new THREE.VideoTexture(this.videoElement2);
    this.setupTexture(this.videoTexture2);

    var geo1 = new THREE.SphereGeometry(500, 60, 40);
    geo1.scale(-1, 1, 1);
    var geo2 = new THREE.SphereGeometry(499, 60, 40);
    geo2.scale(-1, 1, 1);

    var mat1 = new THREE.MeshBasicMaterial({ map: this.videoTexture1, transparent: true, opacity: 1, depthWrite: true });
    var mat2 = new THREE.MeshBasicMaterial({ map: this.videoTexture2, transparent: true, opacity: 0, depthWrite: false });

    this.videoSphere1 = new THREE.Mesh(geo1, mat1);
    this.videoSphere2 = new THREE.Mesh(geo2, mat2);
    this.videoSphere2.visible = false;

    this.scene.add(this.videoSphere1);
    this.scene.add(this.videoSphere2);

    return new Promise(function (resolve, reject) {
      this.videoElement1.addEventListener('canplaythrough', function () { resolve(); }, { once: true });
      this.videoElement1.addEventListener('error', function () { reject(new Error("Failed to load meadow.mp4")); }, { once: true });
      this.videoElement1.load();
    }.bind(this));
  }

  setupVideoElement(vid) {
    vid.id = 'video-' + Math.random().toString(36).substr(2, 9);
    vid.crossOrigin = 'anonymous';
    vid.playsInline = true;
    vid.loop = true;
    vid.muted = true;
    vid.style.display = 'none';
    document.body.appendChild(vid);
  }

  setupTexture(tex) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
  }

  startPlayback() {
    // Unmute and set initial volumes — audio crossfade uses HTMLMediaElement.volume
    // instead of createMediaElementSource, which has known reliability issues on Quest/Chromium.
    this.videoElement1.muted = false;
    this.videoElement2.muted = false;
    this.videoElement1.volume = 1.0;
    this.videoElement2.volume = 0.0;
    this.videoElement1.play().catch(function (e) { log('SceneManager: Video play error: ' + e.message); });
    log('SceneManager: playback started');
  }

  update() {
    try {
      if (this.currentSphere === 1 && this.videoTexture1) this.videoTexture1.needsUpdate = true;
      if (this.currentSphere === 2 && this.videoTexture2) this.videoTexture2.needsUpdate = true;
      // During crossfade, update both
      if (this.isFading) {
        this.videoTexture1.needsUpdate = true;
        this.videoTexture2.needsUpdate = true;
      }
    } catch (e) {}
  }

  switchScene(sceneName) {
    if (this.isFading) {
      log('SceneManager: already fading, ignoring switch to ' + sceneName);
      return;
    }
    this.isFading = true;
    log('SceneManager: switching scene to ' + sceneName);

    var newSrc = 'assets/' + sceneName.toLowerCase() + '.mp4';
    var targetVideo = this.currentSphere === 1 ? this.videoElement2 : this.videoElement1;
    var targetSphere = this.currentSphere === 1 ? this.videoSphere2 : this.videoSphere1;
    var currentSphereObj = this.currentSphere === 1 ? this.videoSphere1 : this.videoSphere2;
    var currentVideo = this.currentSphere === 1 ? this.videoElement1 : this.videoElement2;
    var self = this;

    targetVideo.src = newSrc;
    targetVideo.volume = 0;
    targetVideo.muted = false;
    targetVideo.load();

    targetVideo.addEventListener('canplaythrough', function onReady() {
      targetVideo.removeEventListener('canplaythrough', onReady);
      log('SceneManager: ' + sceneName + '.mp4 loaded, starting crossfade');

      targetVideo.play().then(function () {
        log('SceneManager: ' + sceneName + ' playing');

        targetSphere.visible = true;
        targetSphere.material.depthWrite = false;

        var opacity = 0;
        var fadeInterval = setInterval(function () {
          try {
            opacity += 0.05;
            targetSphere.material.opacity = opacity;
            currentSphereObj.material.opacity = 1 - opacity;
            // Crossfade audio via element volume
            targetVideo.volume = Math.min(1, opacity);
            currentVideo.volume = Math.max(0, 1 - opacity);

            if (opacity >= 1) {
              clearInterval(fadeInterval);
              targetSphere.material.opacity = 1;
              targetSphere.material.depthWrite = true;
              currentSphereObj.material.opacity = 0;
              currentSphereObj.material.depthWrite = false;
              currentSphereObj.visible = false;

              // Pause old video safely
              try { currentVideo.pause(); } catch (e) {}

              self.currentSphere = self.currentSphere === 1 ? 2 : 1;
              self.isFading = false;
              log('SceneManager: crossfade to ' + sceneName + ' complete');
            }
          } catch (err) {
            clearInterval(fadeInterval);
            self.isFading = false;
            log('SceneManager: crossfade error — ' + err.message);
          }
        }, 50);
      }).catch(function (e) {
        log('SceneManager: play() failed for ' + sceneName + ' — ' + e.message);
        self.isFading = false;
      });
    });

    // Timeout safety — if video never loads, unlock fading after 10s
    setTimeout(function () {
      if (self.isFading) {
        log('SceneManager: scene switch timed out for ' + sceneName);
        self.isFading = false;
      }
    }, 10000);
  }
}

var sceneManager = new SceneManager();
