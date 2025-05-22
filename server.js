const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static('public'));

// Health check endpoint for Cloud Run
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Main route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

wss.on('connection', (ws) => {
  console.log('Client connected');
  
  let openaiWs = null;
  let pingInterval = null;
  
  // Connect to OpenAI Realtime API
  const connectToOpenAI = () => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('OPENAI_API_KEY environment variable not set');
      ws.send(JSON.stringify({ type: 'error', message: 'API key not configured' }));
      return;
    }

    // Log API key info (without exposing the key)
    console.log('API Key present:', !!apiKey);
    console.log('API Key length:', apiKey.length);
    console.log('API Key starts with sk-:', apiKey.startsWith('sk-'));

    const url = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01`;
    console.log('Connecting to OpenAI:', url);
    
    openaiWs = new WebSocket(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    });

    openaiWs.on('open', () => {
      console.log('Connected to OpenAI Realtime API');
      
      // Configure the session
      const sessionConfig = {
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: 'You are a helpful voice assistant. Be concise and natural in your responses.',
          voice: 'alloy',
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          input_audio_transcription: {
            model: 'whisper-1'
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 200
          }
        }
      };
      
      console.log('Sending session config:', JSON.stringify(sessionConfig, null, 2));
      openaiWs.send(JSON.stringify(sessionConfig));
      
      // Notify client that connection is ready
      ws.send(JSON.stringify({ type: 'connected' }));
    });

    openaiWs.on('pong', () => {
      console.log('Received pong from OpenAI');
    });

    openaiWs.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('Received from OpenAI:', message.type, message.error ? `ERROR: ${JSON.stringify(message.error)}` : '');
        
        // Log errors in detail
        if (message.type === 'error') {
          console.error('OpenAI API Error:', JSON.stringify(message, null, 2));
        }
        
        // Start ping only after session is ready and we get a response.done
        if (message.type === 'response.done' && !pingInterval) {
          console.log('First response completed, starting keep-alive pings');
          pingInterval = setInterval(() => {
            if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
              openaiWs.ping();
              console.log('Sent ping to OpenAI');
            }
          }, 30000); // Ping every 30 seconds
        }
        
        // Forward relevant messages to client
        switch (message.type) {
          case 'session.created':
            console.log('Session created successfully');
            ws.send(JSON.stringify(message));
            break;
          case 'session.updated':
            console.log('Session updated successfully - connection is ready');
            ws.send(JSON.stringify(message));
            break;
          case 'conversation.item.created':
          case 'conversation.item.truncated':
          case 'conversation.item.deleted':
          case 'conversation.item.input_audio_transcription.completed':
          case 'conversation.item.input_audio_transcription.failed':
          case 'response.created':
          case 'response.done':
          case 'response.output_item.added':
          case 'response.output_item.done':
          case 'response.content_part.added':
          case 'response.content_part.done':
          case 'response.text.delta':
          case 'response.text.done':
          case 'response.audio_transcript.delta':
          case 'response.audio_transcript.done':
          case 'response.audio.delta':
          case 'response.audio.done':
          case 'response.function_call_arguments.delta':
          case 'response.function_call_arguments.done':
          case 'rate_limits.updated':
          case 'input_audio_buffer.committed':
          case 'input_audio_buffer.cleared':
          case 'input_audio_buffer.speech_started':
          case 'input_audio_buffer.speech_stopped':
          case 'error':
            ws.send(JSON.stringify(message));
            break;
          
          default:
            console.log('Unhandled message type:', message.type, JSON.stringify(message, null, 2));
        }
      } catch (error) {
        console.error('Error parsing OpenAI message:', error);
        console.error('Raw message:', data.toString());
      }
    });

    openaiWs.on('error', (error) => {
      console.error('OpenAI WebSocket error:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        type: error.type
      });
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: `OpenAI connection error: ${error.message}` 
      }));
    });

    openaiWs.on('close', (code, reason) => {
      console.log('OpenAI WebSocket closed');
      console.log('Close code:', code);
      console.log('Close reason:', reason ? reason.toString() : 'No reason provided');
      
      // Clear ping interval
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      
      let closeMessage = 'OpenAI connection closed';
      if (code === 1000) closeMessage = 'Normal closure';
      else if (code === 1006) closeMessage = 'Connection lost unexpectedly';
      else if (code === 4001) closeMessage = 'Invalid API key';
      else if (code === 4003) closeMessage = 'Rate limit exceeded';
      else if (code === 4004) closeMessage = 'Model not available';
      else if (code >= 4000) closeMessage = `OpenAI API error (${code})`;
      
      ws.send(JSON.stringify({ 
        type: 'disconnected',
        code: code,
        message: closeMessage,
        reason: reason ? reason.toString() : undefined
      }));
    });
  };

  // Handle messages from client
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      if (data.type === 'connect') {
        connectToOpenAI();
      } else if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
        // Forward message to OpenAI
        openaiWs.send(message);
      }
    } catch (error) {
      console.error('Error handling client message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
    if (openaiWs) {
      openaiWs.close();
    }
  });

  ws.on('error', (error) => {
    console.error('Client WebSocket error:', error);
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
