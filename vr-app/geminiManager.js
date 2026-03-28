class GeminiManager {
    constructor() {
        this.ws = null;
        this.apiKey = null;
        this.systemPrompt = null;

        this.audioContext = null;
        this.processorNode = null;
        this.mediaStream = null;
        this.micSource = null;

        // Audio playback queue
        this.playQueue = [];
        this.isPlaying = false;
        this.nextPlayTime = 0;

        // Reconnection
        this.shouldReconnect = true;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000; // ms
        this.micReady = false;
    }

    async connect() {
        log('GeminiManager: Connecting to Gemini Live API...');
        this.shouldReconnect = true;
        this.reconnectAttempts = 0;

        // 0. Fetch API key from server
        try {
            const res = await fetch('/api/config');
            const config = await res.json();
            this.apiKey = config.geminiApiKey;
        } catch (err) {
            log('GeminiManager error: failed to fetch API key from server');
            return;
        }

        if (!this.apiKey || this.apiKey === 'REPLACE_WITH_YOUR_GEMINI_API_KEY') {
            log('GeminiManager error: set GEMINI_API_KEY in .env file');
            return;
        }

        // 1. Fetch the therapy script from script.md
        try {
            const scriptRes = await fetch('/script.md');
            this.systemPrompt = await scriptRes.text();
            log('GeminiManager: loaded script.md (' + this.systemPrompt.length + ' chars)');
        } catch (err) {
            log('GeminiManager error: failed to load script.md — ' + err.message);
            return;
        }

        // 2. Share AudioContext from audioManager
        this.audioContext = audioManager.audioContext;
        if (!this.audioContext) {
            log('GeminiManager error: audioContext not initialized');
            return;
        }

        // 3. Setup microphone (once)
        if (!this.micReady) {
            await this.setupMicrophone();
        }

        // 4. Open WebSocket
        this.openWebSocket();
    }

    openWebSocket() {
        const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
        this.ws = new WebSocket(url);

        this.ws.onopen = this.onOpen.bind(this);
        this.ws.onmessage = this.onMessage.bind(this);
        this.ws.onerror = this.onError.bind(this);
        this.ws.onclose = this.onClose.bind(this);
    }

    onOpen() {
        log('GeminiManager: WebSocket opened. Sending setup config...');
        this.reconnectAttempts = 0; // Reset on successful connect

        const setupMessage = {
            setup: {
                model: "models/gemini-2.5-flash-native-audio-preview-12-2025",
                generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: "Aoede" }
                        }
                    }
                },
                systemInstruction: {
                    parts: [{
                        text: this.systemPrompt
                    }]
                },
                tools: [{
                    functionDeclarations: [{
                        name: "switch_scene",
                        description: "Changes the VR environment to a new scene. You MUST call this when transitioning between stages. The scene_name should be 'ocean' or 'mountain'.",
                        parameters: {
                            type: "OBJECT",
                            properties: {
                                scene_name: {
                                    type: "STRING",
                                    description: "The scene to switch to: 'ocean' or 'mountain'"
                                }
                            },
                            required: ["scene_name"]
                        }
                    }]
                }]
            }
        };

        log('GeminiManager: Sending setup with script.md (' + this.systemPrompt.length + ' chars)');
        this.ws.send(JSON.stringify(setupMessage));
    }

    async setupMicrophone() {
        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 16000,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });

            this.micSource = this.audioContext.createMediaStreamSource(this.mediaStream);
            this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);

            this.processorNode.onaudioprocess = (e) => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    const inputData = e.inputBuffer.getChannelData(0);

                    const pcm16 = new Int16Array(inputData.length);
                    for (let i = 0; i < inputData.length; i++) {
                        let s = Math.max(-1, Math.min(1, inputData[i]));
                        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                    }

                    const buffer = new Uint8Array(pcm16.buffer);
                    let binary = '';
                    for (let i = 0; i < buffer.byteLength; i++) {
                        binary += String.fromCharCode(buffer[i]);
                    }
                    const base64 = btoa(binary);

                    const audioMessage = {
                        realtimeInput: {
                            mediaChunks: [{
                                mimeType: "audio/pcm;rate=16000",
                                data: base64
                            }]
                        }
                    };

                    this.ws.send(JSON.stringify(audioMessage));
                }
            };

            this.micSource.connect(this.processorNode);
            this.processorNode.connect(this.audioContext.destination);
            this.micReady = true;
            log('GeminiManager: Microphone capture ready at 16kHz.');
        } catch (err) {
            log('GeminiManager: Microphone permission denied or error: ' + err.message);
        }
    }

    onMessage(event) {
        let data;

        // The Live API can send binary Blob frames — skip those
        if (event.data instanceof Blob) {
            // Convert Blob to text first, then parse
            event.data.text().then((text) => {
                try {
                    const parsed = JSON.parse(text);
                    this.handleParsedMessage(parsed);
                } catch (e) {
                    log('GeminiManager: received non-JSON blob (' + event.data.size + ' bytes)');
                }
            });
            return;
        }

        try {
            data = JSON.parse(event.data);
        } catch (e) {
            log('GeminiManager error: failed to parse incoming message: ' + String(event.data).substring(0, 100));
            return;
        }

        this.handleParsedMessage(data);
    }

    handleParsedMessage(data) {
        // Log setup complete acknowledgement
        if (data.setupComplete) {
            log('GeminiManager: setup complete acknowledged by server');
            return;
        }

        if (data.serverContent && data.serverContent.modelTurn) {
            const parts = data.serverContent.modelTurn.parts;
            for (const part of parts) {
                if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.startsWith('audio/pcm')) {
                    this.queueAudio(part.inlineData.data);
                }
                if (part.functionCall) {
                    this.handleFunctionCall(part.functionCall);
                }
            }
        }
    }

    handleFunctionCall(functionCall) {
        if (functionCall.name === "switch_scene") {
            const args = functionCall.args;
            log('GeminiManager: LLM triggered switch_scene with args: ' + JSON.stringify(args));

            // Tell sceneManager to crossfade
            if (sceneManager && sceneManager.switchScene) {
                sceneManager.switchScene(args.scene_name || 'dummy');
            }

            // Let Gemini know the scene was successfully switched
            const toolResponse = {
                toolResponse: {
                    functionResponses: [{
                        response: { output: "Scene switched successfully." },
                        id: functionCall.id
                    }]
                }
            };
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify(toolResponse));
            }
        }
    }

    queueAudio(base64Data) {
        // Decode Base64 to binary string
        const binaryStr = atob(base64Data);
        const buffer = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
            buffer[i] = binaryStr.charCodeAt(i);
        }

        // Audio from Gemini is 16-bit PCM, 24kHz
        const int16Array = new Int16Array(buffer.buffer);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768.0;
        }

        const audioBuffer = this.audioContext.createBuffer(1, float32Array.length, 24000);
        audioBuffer.getChannelData(0).set(float32Array);

        this.playQueue.push(audioBuffer);
        this.playNextAudio();
    }

    playNextAudio() {
        // If we're already playing and haven't reached the end time, bail out
        if (this.isPlaying && this.audioContext.currentTime < this.nextPlayTime) return;

        // If the queue is empty, audio has finished playing
        if (this.playQueue.length === 0) {
            this.isPlaying = false;
            audioManager.duckUp();
            return;
        }

        // First chunk playing
        if (!this.isPlaying) {
            audioManager.duckDown(); // Trigger ducking as speech starts
            this.isPlaying = true;
            // Provide a tiny buffer for smoothness, e.g. 0.05s
            this.nextPlayTime = this.audioContext.currentTime + 0.05;
        }

        const audioBuffer = this.playQueue.shift();
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);

        // Schedule the chunk
        source.start(this.nextPlayTime);
        this.nextPlayTime += audioBuffer.duration;

        // Recursively check queue when this chunk finishes
        source.onended = () => {
            this.playNextAudio();
        };
    }

    onError(err) {
        log('GeminiManager: WebSocket error => ' + (err.message || 'Unknown network error'));
    }

    onClose(event) {
        log('GeminiManager: WebSocket closed => code: ' + event.code + ', reason: ' + (event.reason || 'none'));

        // Clear any pending audio
        this.playQueue = [];
        this.isPlaying = false;

        // Auto-reconnect if not intentionally disconnected
        if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            var delay = this.reconnectDelay * this.reconnectAttempts;
            log('GeminiManager: reconnecting in ' + (delay / 1000) + 's (attempt ' + this.reconnectAttempts + '/' + this.maxReconnectAttempts + ')');
            setTimeout(() => {
                if (this.shouldReconnect) {
                    log('GeminiManager: reconnecting now...');
                    this.openWebSocket();
                }
            }, delay);
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            log('GeminiManager: max reconnect attempts reached. Call geminiManager.connect() to retry.');
        }
    }

    disconnect() {
        this.shouldReconnect = false;
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        log('GeminiManager: disconnected');
    }
}

const geminiManager = new GeminiManager();
