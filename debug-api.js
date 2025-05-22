// Debug script to test OpenAI API key and Realtime API access
// Run with: node debug-api.js

const WebSocket = require('ws');

const apiKey = process.env.OPENAI_API_KEY;

console.log('=== OpenAI Realtime API Debug ===');
console.log('API Key present:', !!apiKey);
console.log('API Key length:', apiKey ? apiKey.length : 0);
console.log('API Key starts with sk-:', apiKey ? apiKey.startsWith('sk-') : false);

if (!apiKey) {
  console.error('❌ OPENAI_API_KEY environment variable not set');
  process.exit(1);
}

// Test 1: Check API key format
if (!apiKey.startsWith('sk-')) {
  console.error('❌ API key should start with "sk-"');
  process.exit(1);
}

console.log('✅ API key format looks correct');

// Test 2: Try to connect to OpenAI Realtime API
console.log('\n=== Testing OpenAI Realtime API Connection ===');

const url = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01';
console.log('Connecting to:', url);

const ws = new WebSocket(url, {
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'OpenAI-Beta': 'realtime=v1'
  }
});

let connected = false;

ws.on('open', () => {
  console.log('✅ Connected to OpenAI Realtime API');
  connected = true;
  
  // Send session config
  const sessionConfig = {
    type: 'session.update',
    session: {
      modalities: ['text', 'audio'],
      instructions: 'You are a helpful assistant.',
      voice: 'alloy',
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm16'
    }
  };
  
  console.log('Sending session config...');
  ws.send(JSON.stringify(sessionConfig));
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log('📨 Received:', message.type);
    
    if (message.type === 'error') {
      console.error('❌ OpenAI Error:', JSON.stringify(message, null, 2));
    } else if (message.type === 'session.created' || message.type === 'session.updated') {
      console.log('✅ Session configured successfully');
      console.log('🎉 OpenAI Realtime API is working correctly!');
      
      // Close after successful test
      setTimeout(() => {
        ws.close();
        process.exit(0);
      }, 1000);
    }
  } catch (error) {
    console.error('❌ Error parsing message:', error);
    console.error('Raw message:', data.toString());
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  console.error('Error details:', {
    code: error.code,
    type: error.type
  });
});

ws.on('close', (code, reason) => {
  console.log('\n=== Connection Closed ===');
  console.log('Close code:', code);
  console.log('Close reason:', reason ? reason.toString() : 'No reason provided');
  
  // Interpret close codes
  if (code === 1000) {
    console.log('✅ Normal closure');
  } else if (code === 1006) {
    console.log('❌ Connection lost unexpectedly');
  } else if (code === 4001) {
    console.log('❌ Invalid API key');
  } else if (code === 4003) {
    console.log('❌ Rate limit exceeded');
  } else if (code === 4004) {
    console.log('❌ Model not available - You may not have access to GPT-4o Realtime Preview');
  } else if (code >= 4000) {
    console.log(`❌ OpenAI API error (${code})`);
  }
  
  if (!connected) {
    console.log('\n🔍 Possible issues:');
    console.log('1. Invalid API key');
    console.log('2. No access to GPT-4o Realtime Preview');
    console.log('3. Network connectivity issues');
    console.log('4. OpenAI service temporarily unavailable');
    
    console.log('\n💡 Next steps:');
    console.log('1. Verify your API key at https://platform.openai.com/api-keys');
    console.log('2. Check if you have access to GPT-4o Realtime Preview');
    console.log('3. Contact OpenAI support if the issue persists');
  }
  
  process.exit(connected ? 0 : 1);
});

// Timeout after 10 seconds
setTimeout(() => {
  if (!connected) {
    console.log('❌ Connection timeout after 10 seconds');
    ws.close();
    process.exit(1);
  }
}, 10000);
