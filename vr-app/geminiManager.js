class GeminiManager {
    constructor() {
        this.ws = null;
        // HARDCODED API KEY AS REQUESTED (for demo purposes)
        this.apiKey = "REPLACE_WITH_YOUR_GEMINI_API_KEY";

        this.audioContext = null;
        this.processorNode = null;
        this.mediaStream = null;

        // Audio playback queue
        this.playQueue = [];
        this.isPlaying = false;
        this.nextPlayTime = 0;
    }

    async connect() {
        log('GeminiManager: Connecting to Gemini Live API...');

        // 1. We share the AudioContext from audioManager since it's already initialized by a user gesture
        this.audioContext = audioManager.audioContext;
        if (!this.audioContext) {
            log('GeminiManager error: audioContext not initialized');
            return;
        }

        // 2. Open WebSocket
        const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
        this.ws = new WebSocket(url);

        this.ws.onopen = this.onOpen.bind(this);
        this.ws.onmessage = this.onMessage.bind(this);
        this.ws.onerror = this.onError.bind(this);
        this.ws.onclose = this.onClose.bind(this);

        // 3. Setup Microphone Capture (this prompts user for mic permissions)
        await this.setupMicrophone();
    }

    onOpen() {
        log('GeminiManager: WebSocket opened. Sending setup config...');

        const setupMessage = {
            setup: {
                model: "models/gemini-2.0-flash-exp",
                systemInstruction: {
                    parts: [{
                        text: `You are a therapist guiding a patient through a structured VR meditation session. You MUST follow this script sequentially stage-by-stage.
            
Stage 1 (Start): You are in the 'meadow'. Welcome the user and lead a 3-breath grounding exercise. Say "breathe in", wait, then say "breathe out" etc. Wait for the user to respond before continuing.
Stage 2 (Middle): When they are relaxed from Stage 1, call the switch_scene tool with scene_name="ocean". Guide them to visualize the waves washing away their tension.
Stage 3 (End): When they are fully relaxed, call switch_scene with scene_name="mountain". Provide a final grounding message to gently conclude the session.

Rules:
- Speak softly, slowly, and concisely (1-2 sentences max at a time).
- Do not rush. Allow the user to speak, respond, or breathe in between your instructions.
- You MUST call the switch_scene tool to advance the visual environment at the exact moments of transition between stages.`
                    }]
                },
                tools: [{
                    functionDeclarations: [{
                        name: "switch_scene",
                        description: "Changes the VR environment to a new scene.",
                        parameters: {
                            type: "OBJECT",
                            properties: {
                                scene_name: {
                                    type: "STRING",
                                    description: "The name of the scene to switch to, e.g. 'ocean', 'forest', 'mountains'."
                                }
                            },
                            required: ["scene_name"]
                        }
                    }]
                }]
            }
        };

        // Optional: add voice selection if desired (Puck, Charon, Aoede)
        // setupMessage.setup.generationConfig = { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } } };

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

            const source = this.audioContext.createMediaStreamSource(this.mediaStream);

            // Use ScriptProcessorNode to capture chunks. 
            // (For production, AudioWorklets are preferred, but this is simple for demo)
            this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);

            this.processorNode.onaudioprocess = (e) => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    const inputData = e.inputBuffer.getChannelData(0);

                    // Convert Float32 (-1 to 1) to Int16
                    const pcm16 = new Int16Array(inputData.length);
                    for (let i = 0; i < inputData.length; i++) {
                        let s = Math.max(-1, Math.min(1, inputData[i]));
                        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                    }

                    // Base64 encode the binary buffer
                    const buffer = new Uint8Array(pcm16.buffer);
                    let binary = '';
                    for (let i = 0; i < buffer.byteLength; i++) {
                        binary += String.fromCharCode(buffer[i]);
                    }
                    const base64 = btoa(binary);

                    // Construct ClientContent PCM chunk
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

            source.connect(this.processorNode);
            this.processorNode.connect(this.audioContext.destination);
            log('GeminiManager: Microphone capture actively streaming at 16kHz.');
        } catch (err) {
            log('GeminiManager: Microphone permission denied or error: ' + err.message);
        }
    }

    onMessage(event) {
        let data;
        try {
            data = JSON.parse(event.data);
        } catch (e) {
            log('GeminiManager error: failed to parse incoming message');
            return;
        }

        if (data.serverContent && data.serverContent.modelTurn) {
            const parts = data.serverContent.modelTurn.parts;
            for (const part of parts) {
                // Handle incoming audio
                if (part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')) {
                    this.queueAudio(part.inlineData.data);
                }
                // Handle incoming tool call
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
        log(`GeminiManager: WebSocket closed => code: ${event.code}, reason: ${event.reason}`);
    }
}

const geminiManager = new GeminiManager();
