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
    // Create two video elements for crossfading
    this.videoElement1 = document.createElement('video');
    this.setupVideoElement(this.videoElement1);
    this.videoElement1.src = 'assets/meadow.mp4'; // Default starting scene

    this.videoElement2 = document.createElement('video');
    this.setupVideoElement(this.videoElement2);

    this.videoTexture1 = new THREE.VideoTexture(this.videoElement1);
    this.setupTexture(this.videoTexture1);

    this.videoTexture2 = new THREE.VideoTexture(this.videoElement2);
    this.setupTexture(this.videoTexture2);

    const geo = new THREE.SphereGeometry(500, 60, 40);
    geo.scale(-1, 1, 1); // Invert to look from inside

    const mat1 = new THREE.MeshBasicMaterial({ map: this.videoTexture1, transparent: true, opacity: 1 });
    const mat2 = new THREE.MeshBasicMaterial({ map: this.videoTexture2, transparent: true, opacity: 0 });

    this.videoSphere1 = new THREE.Mesh(geo, mat1);
    this.videoSphere2 = new THREE.Mesh(geo, mat2);

    this.scene.add(this.videoSphere1);
    this.scene.add(this.videoSphere2);

    return new Promise((resolve, reject) => {
      this.videoElement1.addEventListener('canplaythrough', () => {
        resolve();
      }, { once: true });
      this.videoElement1.addEventListener('error', (e) => reject(new Error("Failed to load starting scene 'meadow.mp4'")), { once: true });
      this.videoElement1.load();
    });
  }

  setupVideoElement(vid) {
    vid.id = 'video-' + Math.random().toString(36).substr(2, 9);
    vid.crossOrigin = 'anonymous';
    vid.playsInline = true;
    vid.loop = true;
    vid.muted = true; // start muted for Quest autoplay
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
    this.videoElement1.muted = false;
    this.videoElement1.play().catch(e => log('SceneManager: Video play error: ' + e.message));
  }

  update() {
    if (this.currentSphere === 1 && this.videoTexture1) this.videoTexture1.needsUpdate = true;
    if (this.currentSphere === 2 && this.videoTexture2) this.videoTexture2.needsUpdate = true;
  }

  switchScene(sceneName) {
    if (this.isFading) return;
    this.isFading = true;
    log('SceneManager: switching scene to ' + sceneName);

    // Map the scene name from Gemini directly to an MP4 file in assets/
    const newSrc = `assets/${sceneName.toLowerCase()}.mp4`;
    const targetVideo = this.currentSphere === 1 ? this.videoElement2 : this.videoElement1;
    const targetSphere = this.currentSphere === 1 ? this.videoSphere2 : this.videoSphere1;
    const currentSphere = this.currentSphere === 1 ? this.videoSphere1 : this.videoSphere2;

    targetVideo.src = newSrc;
    targetVideo.load();
    targetVideo.play().then(() => {
      // Simple crossfade
      let opacity = 0;
      const fadeInterval = setInterval(() => {
        opacity += 0.05;
        targetSphere.material.opacity = opacity;
        currentSphere.material.opacity = 1 - opacity;

        if (opacity >= 1) {
          clearInterval(fadeInterval);
          targetSphere.material.opacity = 1;
          currentSphere.material.opacity = 0;
          currentSphere.material.map.image.pause(); // pause old video

          this.currentSphere = this.currentSphere === 1 ? 2 : 1;
          this.isFading = false;
          log('SceneManager: crossfade complete');
        }
      }, 50);
    }).catch(e => {
      log('SceneManager: failed to switch scene - ' + e.message);
      this.isFading = false;
    });
  }
}

const sceneManager = new SceneManager();
