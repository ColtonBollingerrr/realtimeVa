const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// WebSocket server
const wss = new WebSocket.Server({ server });

// Store active connections
const activeConnections = new Map();

// WebSocket connection handler
wss.on('connection', (ws, request) => {
    console.log('New WebSocket connection established');
    
    const connectionId = generateConnectionId();
    activeConnections.set(connectionId, {
        ws,
        openaiWs: null,
        isConnected: false
    });

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            await handleWebSocketMessage(connectionId, data);
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to process message'
            }));
        }
    });

    ws.on('close', () => {
        console.log('WebSocket connection closed');
        const connection = activeConnections.get(connectionId);
        if (connection?.openaiWs) {
            connection.openaiWs.close();
        }
        activeConnections.delete(connectionId);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

async function handleWebSocketMessage(connectionId, data) {
    const connection = activeConnections.get(connectionId);
    if (!connection) return;

    const { ws } = connection;

    switch (data.type) {
        case 'start_session':
            await startOpenAISession(connectionId, data.config);
            break;
        
        case 'audio_data':
            if (connection.openaiWs && connection.isConnected) {
                // Forward audio data to OpenAI
                connection.openaiWs.send(JSON.stringify({
                    type: 'input_audio_buffer.append',
                    audio: data.audio
                }));
            }
            break;
        
        case 'commit_audio':
            if (connection.openaiWs && connection.isConnected) {
                connection.openaiWs.send(JSON.stringify({
                    type: 'input_audio_buffer.commit'
                }));
                connection.openaiWs.send(JSON.stringify({
                    type: 'response.create'
                }));
            }
            break;
        
        case 'interrupt':
            if (connection.openaiWs && connection.isConnected) {
                connection.openaiWs.send(JSON.stringify({
                    type: 'response.cancel'
                }));
            }
            break;
        
        case 'update_session':
            if (connection.openaiWs && connection.isConnected) {
                connection.openaiWs.send(JSON.stringify({
                    type: 'session.update',
                    session: data.session
                }));
            }
            break;
    }
}

async function startOpenAISession(connectionId, config) {
    const connection = activeConnections.get(connectionId);
    if (!connection) return;

    const { ws } = connection;
    
    try {
        // Connect to OpenAI Real-time API
        const openaiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17', {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'OpenAI-Beta': 'realtime=v1'
            }
        });

        connection.openaiWs = openaiWs;

        openaiWs.on('open', () => {
            console.log('Connected to OpenAI Real-time API');
            connection.isConnected = true;
            
            // Send session configuration
            openaiWs.send(JSON.stringify({
                type: 'session.update',
                session: {
                    modalities: ['text', 'audio'],
                    instructions: config?.instructions || 'You are a helpful voice assistant. Respond naturally and conversationally. Always provide audio responses.',
                    voice: config?.voice || 'alloy',
                    input_audio_format: 'pcm16',
                    output_audio_format: 'pcm16',
                    input_audio_transcription: {
                        model: 'whisper-1'
                    },
                    turn_detection: {
                        type: 'server_vad',
                        threshold: 0.5,
                        prefix_padding_ms: 300,
                        silence_duration_ms: 500
                    },
                    tools: [],
                    tool_choice: 'auto',
                    temperature: 0.8,
                    max_response_output_tokens: 4096
                }
            }));

            ws.send(JSON.stringify({
                type: 'session_started',
                message: 'Connected to OpenAI Real-time API'
            }));
        });

        openaiWs.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                // Forward OpenAI messages to client
                ws.send(JSON.stringify({
                    type: 'openai_message',
                    data: data
                }));
            } catch (error) {
                console.error('Error parsing OpenAI message:', error);
            }
        });

        openaiWs.on('close', () => {
            console.log('OpenAI WebSocket connection closed');
            connection.isConnected = false;
            ws.send(JSON.stringify({
                type: 'session_ended',
                message: 'OpenAI connection closed'
            }));
        });

        openaiWs.on('error', (error) => {
            console.error('OpenAI WebSocket error:', error);
            connection.isConnected = false;
            ws.send(JSON.stringify({
                type: 'error',
                message: 'OpenAI connection error'
            }));
        });

    } catch (error) {
        console.error('Error starting OpenAI session:', error);
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Failed to start OpenAI session'
        }));
    }
}

function generateConnectionId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// API endpoint to check OpenAI API key
app.get('/api/check-config', (req, res) => {
    res.json({
        hasApiKey: !!process.env.OPENAI_API_KEY,
        environment: process.env.NODE_ENV || 'development'
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`OpenAI API Key configured: ${!!process.env.OPENAI_API_KEY}`);
});
