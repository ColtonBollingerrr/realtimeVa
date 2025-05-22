class VoiceAssistant {
    constructor() {
        this.ws = null;
        this.mediaRecorder = null;
        this.audioContext = null;
        this.isRecording = false;
        this.isConnected = false;
        this.audioChunks = [];
        this.audioQueue = [];
        this.isPlaying = false;
        
        this.initializeElements();
        this.initializeAudio();
        this.setupEventListeners();
        this.checkConfiguration();
    }

    initializeElements() {
        this.connectBtn = document.getElementById('connectBtn');
        this.voiceBtn = document.getElementById('voiceBtn');
        this.status = document.getElementById('status');
        this.voiceSelect = document.getElementById('voice-select');
        this.instructions = document.getElementById('instructions');
        this.transcriptContent = document.getElementById('transcript-content');
        this.visualizer = document.getElementById('visualizer');
        this.errorContainer = document.getElementById('error-container');
    }

    async initializeAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    channelCount: 1,
                    sampleRate: 24000,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });
            
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            
            this.setupAudioVisualization(stream);
            this.setupMediaRecorder();
            
        } catch (error) {
            this.showError('Microphone access denied. Please allow microphone access and refresh the page.');
            console.error('Error accessing microphone:', error);
        }
    }

    setupAudioVisualization(stream) {
        const analyser = this.audioContext.createAnalyser();
        const microphone = this.audioContext.createMediaStreamSource(stream);
        
        microphone.connect(analyser);
        analyser.fftSize = 256;
        
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        // Create audio bars
        this.createAudioBars();
        
        const animate = () => {
            if (this.isRecording) {
                analyser.getByteFrequencyData(dataArray);
                this.updateAudioBars(dataArray);
                requestAnimationFrame(animate);
            }
        };
        
        this.animateAudio = animate;
    }

    createAudioBars() {
        const visualizer = this.visualizer;
        visualizer.innerHTML = '';
        
        for (let i = 0; i < 32; i++) {
            const bar = document.createElement('div');
            bar.className = 'audio-bar';
            bar.style.left = `${(i * 100) / 32}%`;
            visualizer.appendChild(bar);
        }
        
        this.audioBars = visualizer.querySelectorAll('.audio-bar');
    }

    updateAudioBars(dataArray) {
        const bars = this.audioBars;
        const barCount = bars.length;
        const step = Math.floor(dataArray.length / barCount);
        
        for (let i = 0; i < barCount; i++) {
            const value = dataArray[i * step];
            const height = (value / 255) * 100;
            bars[i].style.height = `${Math.max(2, height)}%`;
        }
    }

    setupMediaRecorder() {
        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.audioChunks.push(event.data);
            }
        };

        this.mediaRecorder.onstop = async () => {
            if (this.audioChunks.length > 0) {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                await this.processAudioBlob(audioBlob);
                this.audioChunks = [];
            }
        };
    }

    async processAudioBlob(audioBlob) {
        try {
            const arrayBuffer = await audioBlob.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            // Convert to PCM16 format for OpenAI
            const pcm16Data = this.convertToPCM16(audioBuffer);
            const base64Audio = this.arrayBufferToBase64(pcm16Data);
            
            if (this.ws && this.isConnected) {
                this.ws.send(JSON.stringify({
                    type: 'audio_data',
                    audio: base64Audio
                }));
                
                // Commit the audio buffer
                this.ws.send(JSON.stringify({
                    type: 'commit_audio'
                }));
            }
        } catch (error) {
            console.error('Error processing audio:', error);
            this.showError('Error processing audio data');
        }
    }

    convertToPCM16(audioBuffer) {
        const numberOfChannels = audioBuffer.numberOfChannels;
        const length = audioBuffer.length;
        const sampleRate = audioBuffer.sampleRate;
        
        // Resample to 24kHz if needed
        const targetSampleRate = 24000;
        const resampleRatio = targetSampleRate / sampleRate;
        const resampledLength = Math.floor(length * resampleRatio);
        
        const pcm16 = new Int16Array(resampledLength);
        const channelData = audioBuffer.getChannelData(0); // Use first channel
        
        for (let i = 0; i < resampledLength; i++) {
            const sourceIndex = Math.floor(i / resampleRatio);
            const sample = channelData[sourceIndex] || 0;
            pcm16[i] = Math.max(-32768, Math.min(32767, sample * 32768));
        }
        
        return pcm16.buffer;
    }

    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    async playAudio(base64Audio) {
        try {
            const arrayBuffer = this.base64ToArrayBuffer(base64Audio);
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);
            
            this.isPlaying = true;
            source.onended = () => {
                this.isPlaying = false;
                this.playNextAudio();
            };
            
            source.start();
        } catch (error) {
            console.error('Error playing audio:', error);
            this.isPlaying = false;
            this.playNextAudio();
        }
    }

    playNextAudio() {
        if (this.audioQueue.length > 0 && !this.isPlaying) {
            const nextAudio = this.audioQueue.shift();
            this.playAudio(nextAudio);
        }
    }

    setupEventListeners() {
        this.connectBtn.addEventListener('click', () => {
            if (this.isConnected) {
                this.disconnect();
            } else {
                this.connect();
            }
        });

        this.voiceBtn.addEventListener('mousedown', () => this.startRecording());
        this.voiceBtn.addEventListener('mouseup', () => this.stopRecording());
        this.voiceBtn.addEventListener('mouseleave', () => this.stopRecording());
        
        // Touch events for mobile
        this.voiceBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startRecording();
        });
        this.voiceBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.stopRecording();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !this.isRecording && this.isConnected) {
                e.preventDefault();
                this.startRecording();
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space' && this.isRecording) {
                e.preventDefault();
                this.stopRecording();
            }
        });
    }

    async checkConfiguration() {
        try {
            const response = await fetch('/api/check-config');
            const config = await response.json();
            
            if (!config.hasApiKey) {
                this.showError('OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.');
                this.connectBtn.disabled = true;
            }
        } catch (error) {
            console.error('Error checking configuration:', error);
        }
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.ws = new WebSocket(wsUrl);
        this.updateStatus('Connecting...', 'connecting');
        
        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.startSession();
        };

        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.isConnected = false;
            this.updateStatus('Disconnected', 'disconnected');
            this.connectBtn.textContent = 'Connect';
            this.voiceBtn.disabled = true;
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.showError('Connection error. Please try again.');
        };
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
        this.isConnected = false;
        this.updateStatus('Disconnected', 'disconnected');
        this.connectBtn.textContent = 'Connect';
        this.voiceBtn.disabled = true;
    }

    startSession() {
        const config = {
            voice: this.voiceSelect.value,
            instructions: this.instructions.value.trim() || 'You are a helpful voice assistant. Respond naturally and conversationally.'
        };

        this.ws.send(JSON.stringify({
            type: 'start_session',
            config: config
        }));
    }

    handleMessage(message) {
        switch (message.type) {
            case 'session_started':
                this.isConnected = true;
                this.updateStatus('Connected', 'connected');
                this.connectBtn.textContent = 'Disconnect';
                this.voiceBtn.disabled = false;
                this.clearError();
                break;

            case 'session_ended':
                this.isConnected = false;
                this.updateStatus('Disconnected', 'disconnected');
                this.connectBtn.textContent = 'Connect';
                this.voiceBtn.disabled = true;
                break;

            case 'openai_message':
                this.handleOpenAIMessage(message.data);
                break;

            case 'error':
                this.showError(message.message);
                break;
        }
    }

    handleOpenAIMessage(data) {
        switch (data.type) {
            case 'conversation.item.input_audio_transcription.completed':
                if (data.transcript) {
                    this.addTranscript('user', data.transcript);
                }
                break;

            case 'response.audio.delta':
                if (data.delta) {
                    this.audioQueue.push(data.delta);
                    if (!this.isPlaying) {
                        this.playNextAudio();
                    }
                }
                break;

            case 'response.text.delta':
                if (data.delta) {
                    this.updateAssistantResponse(data.delta);
                }
                break;

            case 'response.done':
                this.finalizeAssistantResponse();
                break;

            case 'error':
                this.showError(`OpenAI Error: ${data.error?.message || 'Unknown error'}`);
                break;

            case 'session.created':
                console.log('OpenAI session created:', data);
                break;

            case 'session.updated':
                console.log('OpenAI session updated:', data);
                break;

            default:
                console.log('Unhandled OpenAI message:', data);
        }
    }

    startRecording() {
        if (!this.isConnected || this.isRecording || !this.mediaRecorder) return;

        try {
            this.audioChunks = [];
            this.mediaRecorder.start();
            this.isRecording = true;
            
            this.voiceBtn.textContent = 'Recording...';
            this.voiceBtn.classList.add('recording');
            this.visualizer.style.display = 'block';
            
            if (this.animateAudio) {
                this.animateAudio();
            }
            
            console.log('Recording started');
        } catch (error) {
            console.error('Error starting recording:', error);
            this.showError('Error starting recording');
        }
    }

    stopRecording() {
        if (!this.isRecording || !this.mediaRecorder) return;

        try {
            this.mediaRecorder.stop();
            this.isRecording = false;
            
            this.voiceBtn.textContent = 'Hold to Talk';
            this.voiceBtn.classList.remove('recording');
            this.visualizer.style.display = 'none';
            
            console.log('Recording stopped');
        } catch (error) {
            console.error('Error stopping recording:', error);
            this.showError('Error stopping recording');
        }
    }

    updateStatus(text, className) {
        this.status.textContent = text;
        this.status.className = `status ${className}`;
    }

    addTranscript(speaker, text) {
        const transcriptItem = document.createElement('div');
        transcriptItem.className = `transcript-item ${speaker}`;
        transcriptItem.innerHTML = `<strong>${speaker === 'user' ? 'You' : 'Assistant'}:</strong> ${text}`;
        
        this.transcriptContent.appendChild(transcriptItem);
        this.transcriptContent.scrollTop = this.transcriptContent.scrollHeight;
    }

    currentAssistantResponse = null;

    updateAssistantResponse(delta) {
        if (!this.currentAssistantResponse) {
            this.currentAssistantResponse = document.createElement('div');
            this.currentAssistantResponse.className = 'transcript-item assistant';
            this.currentAssistantResponse.innerHTML = '<strong>Assistant:</strong> ';
            this.transcriptContent.appendChild(this.currentAssistantResponse);
        }
        
        const currentText = this.currentAssistantResponse.textContent.replace('Assistant: ', '');
        this.currentAssistantResponse.innerHTML = `<strong>Assistant:</strong> ${currentText + delta}`;
        this.transcriptContent.scrollTop = this.transcriptContent.scrollHeight;
    }

    finalizeAssistantResponse() {
        this.currentAssistantResponse = null;
    }

    showError(message) {
        this.errorContainer.innerHTML = `
            <div class="error-message">
                ${message}
            </div>
        `;
        
        setTimeout(() => {
            this.clearError();
        }, 5000);
    }

    clearError() {
        this.errorContainer.innerHTML = '';
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const assistant = new VoiceAssistant();
    
    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && assistant.audioContext) {
            // Resume audio context if it was suspended
            if (assistant.audioContext.state === 'suspended') {
                assistant.audioContext.resume();
            }
        }
    });
});
