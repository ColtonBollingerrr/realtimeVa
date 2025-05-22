const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const cors = require('cors');
const path = require('path');
const VectorService = require('./services/vectorService');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Initialize vector service
const vectorService = new VectorService();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// WebSocket server
const wss = new WebSocket.Server({ server });

// Store active connections and their conversation history
const activeConnections = new Map();

// WebSocket connection handler
wss.on('connection', (ws, request) => {
    console.log('New WebSocket connection established');
    
    const connectionId = generateConnectionId();
    activeConnections.set(connectionId, {
        ws,
        openaiWs: null,
        isConnected: false,
        conversationHistory: [],
        pendingUserMessage: null
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
                
                // Store that we're expecting a user message for context enhancement
                connection.pendingUserMessage = true;
                
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

async function enhanceSessionWithContext(connection, userMessage) {
    try {
        // Get enhanced instructions with contextual information
        const baseInstructions = `You are a helpful voice assistant for our company. 
        Respond naturally and conversationally while providing detailed and accurate information about our services, projects, and capabilities.
        Always provide audio responses and be thorough in your explanations.`;
        
        const enhancedInstructions = await vectorService.getEnhancedInstructions(
            baseInstructions,
            userMessage,
            connection.conversationHistory
        );

        // Update the session with enhanced context
        if (connection.openaiWs && connection.isConnected) {
            connection.openaiWs.send(JSON.stringify({
                type: 'session.update',
                session: {
                    instructions: enhancedInstructions
                }
            }));
        }

        // Add to conversation history
        connection.conversationHistory.push({
            role: 'user',
            content: userMessage
        });

        // Keep conversation history manageable (last 10 messages)
        if (connection.conversationHistory.length > 10) {
            connection.conversationHistory = connection.conversationHistory.slice(-10);
        }

    } catch (error) {
        console.error('Error enhancing session with context:', error);
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
            
            // Send initial session configuration
            openaiWs.send(JSON.stringify({
                type: 'session.update',
                session: {
                    modalities: ['text', 'audio'],
                    instructions: config?.instructions || `You are a helpful voice assistant for our company. 
                    Respond naturally and conversationally while providing detailed information about our services and capabilities.
                    Always provide audio responses and be thorough in your explanations.`,
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
                message: 'Connected to OpenAI Real-time API with vector store integration'
            }));
        });

        openaiWs.on('message', async (message) => {
            try {
                const data = JSON.parse(message);
                
                // Handle transcription completion to enhance context
                if (data.type === 'conversation.item.input_audio_transcription.completed' && 
                    data.transcript && connection.pendingUserMessage) {
                    
                    connection.pendingUserMessage = false;
                    await enhanceSessionWithContext(connection, data.transcript);
                }
                
                // Handle assistant responses for conversation history
                if (data.type === 'conversation.item.created' && 
                    data.item && data.item.role === 'assistant') {
                    
                    let assistantMessage = '';
                    if (data.item.content) {
                        data.item.content.forEach(content => {
                            if (content.type === 'text' && content.text) {
                                assistantMessage += content.text;
                            }
                        });
                    }
                    
                    if (assistantMessage) {
                        connection.conversationHistory.push({
                            role: 'assistant',
                            content: assistantMessage
                        });
                    }
                }
                
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

// API endpoint to check configuration
app.get('/api/check-config', (req, res) => {
    res.json({
        hasApiKey: !!process.env.OPENAI_API_KEY,
        hasSupabase: !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
        environment: process.env.NODE_ENV || 'development'
    });
});

// API endpoints for document management
app.post('/api/documents', async (req, res) => {
    try {
        const { content, metadata = {} } = req.body;
        
        if (!content) {
            return res.status(400).json({ error: 'Content is required' });
        }
        
        const document = await vectorService.addDocument(content, metadata);
        res.json({ success: true, document });
    } catch (error) {
        console.error('Error adding document:', error);
        res.status(500).json({ error: 'Failed to add document' });
    }
});

app.get('/api/documents/search', async (req, res) => {
    try {
        const { 
            query, 
            limit = 5, 
            threshold = 0.7,
            projectType,
            serviceType 
        } = req.query;
        
        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }
        
        const results = await vectorService.searchDocuments(query, {
            limit: parseInt(limit),
            threshold: parseFloat(threshold),
            projectType,
            serviceType
        });
        
        res.json({ results });
    } catch (error) {
        console.error('Error searching documents:', error);
        res.status(500).json({ error: 'Failed to search documents' });
    }
});

app.get('/api/documents/stats', async (req, res) => {
    try {
        const { data, error } = await vectorService.supabase.rpc('get_document_stats');
        
        if (error) throw error;
        
        res.json({ stats: data[0] || {} });
    } catch (error) {
        console.error('Error getting document stats:', error);
        res.status(500).json({ error: 'Failed to get document statistics' });
    }
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`OpenAI API Key configured: ${!!process.env.OPENAI_API_KEY}`);
    console.log(`Supabase configured: ${!!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY)}`);
});    max_response_output_tokens: 4096
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
