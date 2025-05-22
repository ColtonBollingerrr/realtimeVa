
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
  
  // Connect to OpenAI Realtime API
  const connectToOpenAI = () => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('OPENAI_API_KEY environment variable not set');
      ws.send(JSON.stringify({ type: 'error', message: 'API key not configured' }));
      return;
    }

    const url = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01`;
    
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
      
      openaiWs.send(JSON.stringify(sessionConfig));
      
      // Notify client that connection is ready
      ws.send(JSON.stringify({ type: 'connected' }));
    });

    openaiWs.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        // Forward relevant messages to client
        switch (message.type) {
          case 'session.created':
          case 'session.updated':
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
            console.log('Unhandled message type:', message.type);
        }
      } catch (error) {
        console.error('Error parsing OpenAI message:', error);
      }
    });

    openaiWs.on('error', (error) => {
      console.error('OpenAI WebSocket error:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'OpenAI connection error' }));
    });

    openaiWs.on('close', () => {
      console.log('OpenAI WebSocket closed');
      ws.send(JSON.stringify({ type: 'disconnected' }));
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
