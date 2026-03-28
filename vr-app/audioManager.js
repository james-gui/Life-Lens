class AudioManager {
    constructor() {
        this.audioContext = null;
        this.bgmNode = null;
        this.gainNode = null;
        this.isInitialized = false;
    }

    init() {
        if (this.isInitialized) return Promise.resolve();

        // We create the AudioContext on user gesture (e.g. click "Begin Session")
        // Use default sample rate (44.1k/48k) so video audio works. Gemini mic resamples separately.
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.audioContext.resume(); // Ensure running — gesture context may have expired in async chain
        this.isInitialized = true;
        log('AudioManager: initialized AudioContext at ' + this.audioContext.sampleRate + 'Hz');

        // Real background music fetching
        // We expect an assets/music.mp3 file to exist.
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = 0.05; // ambient quiet background
        this.gainNode.connect(this.audioContext.destination);

        return fetch('assets/music.mp3')
            .then(response => {
                if (!response.ok) throw new Error('music.mp3 not found');
                return response.arrayBuffer();
            })
            .then(arrayBuffer => this.audioContext.decodeAudioData(arrayBuffer))
            .then(audioBuffer => {
                this.bgmNode = this.audioContext.createBufferSource();
                this.bgmNode.buffer = audioBuffer;
                this.bgmNode.loop = true;
                this.bgmNode.connect(this.gainNode);
                this.bgmNode.start();
                log('AudioManager: Background music playing');
            })
            .catch(err => {
                log('AudioManager: Running silent ambient. ' + err.message);
            });
    }

    duckDown() {
        if (!this.gainNode) return;
        this.gainNode.gain.setTargetAtTime(0.01, this.audioContext.currentTime, 0.5);
        log('AudioManager: Ducking DOWN (Gemini speaking)');
    }

    duckUp() {
        if (!this.gainNode) return;
        this.gainNode.gain.setTargetAtTime(0.05, this.audioContext.currentTime, 0.5);
        log('AudioManager: Ducking UP (Gemini finished)');
    }
}

const audioManager = new AudioManager();
