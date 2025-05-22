# Real-time Voice Assistant

A dockerized real-time voice assistant powered by OpenAI's GPT-4o real-time API. This application provides a web-based interface for voice conversations with AI, featuring real-time audio processing and WebSocket connections.

## Features

- 🎤 Real-time voice recording and playback
- 🔊 Live audio visualization during recording
- 💬 Real-time transcription of conversations
- 🎛️ Configurable voice selection (6 OpenAI voices)
- 📱 Mobile-friendly responsive design
- 🐳 Fully dockerized for easy deployment
- 🔒 Secure WebSocket connections
- ⚡ Low-latency audio streaming

## Prerequisites

- Docker and Docker Compose
- OpenAI API key with access to GPT-4o real-time API
- Modern web browser with microphone access

## Quick Start

1. **Clone or create the project files**
   ```bash
   mkdir voice-assistant
   cd voice-assistant
   # Copy all the provided files into this directory
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env and add your OpenAI API key
   ```

3. **Build and run with Docker Compose**
   ```bash
   docker-compose up --build
   ```

4. **Access the application**
   Open your browser and navigate to `http://localhost:3000`

## Configuration

### Environment Variables

- `OPENAI_API_KEY` - Your OpenAI API key (required)
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment mode (default: production)
- `OPENAI_ORGANIZATION` - OpenAI organization ID (optional)

### Voice Options

The application supports 6 different OpenAI voices:
- **Alloy** - Neutral, balanced tone
- **Echo** - Clear, friendly voice
- **Fable** - Warm, expressive voice
- **Onyx** - Deep, authoritative voice
- **Nova** - Bright, energetic voice
- **Shimmer** - Gentle, calm voice

## Usage

1. **Connect**: Click the "Connect" button to establish connection with OpenAI
2. **Configure**: Select your preferred voice and customize instructions
3. **Talk**: Hold down the "Hold to Talk" button and speak
4. **Listen**: Release the button to hear the AI response
5. **View**: See the conversation transcript in real-time

### Keyboard Shortcuts

- **Spacebar**: Hold to record (when connected)

## Architecture

```
┌─────────────────┐    WebSocket    ┌─────────────────┐    WebSocket    ┌─────────────────┐
│   Web Browser   │ ←────────────→ │   Node.js App   │ ←────────────→ │  OpenAI API     │
│                 │                 │                 │                 │                 │
│ • Audio capture │                 │ • Proxy server  │                 │ • GPT-4o        │
│ • Audio playback│                 │ • Format convert│                 │ • Voice synth   │
│ • UI controls   │                 │ • WebSocket mgmt│                 │ • Transcription │
└─────────────────┘                 └─────────────────┘                 └─────────────────┘
```

## API Endpoints

- `GET /` - Serve the main web interface
- `GET /health` - Health check endpoint
- `GET /api/check-config` - Verify API configuration
- `WebSocket /` - Real-time audio communication

## Docker Commands

### Development
```bash
# Build the image
docker build -t voice-assistant .

# Run with environment file
docker run --env-file .env -p 3000:3000 voice-assistant

# View logs
docker-compose logs -f voice-assistant
```

### Production
```bash
# Run in detached mode
docker-compose up -d

# Scale if needed
docker-compose up -d --scale voice-assistant=2

# Update the application
docker-compose pull
docker-compose up -d
```

## Troubleshooting

### Common Issues

1. **Microphone Access Denied**
   - Ensure browser has microphone permissions
   - Use HTTPS in production for microphone access
   - Check browser security settings

2. **Connection Failed**
   - Verify OpenAI API key is valid
   - Check internet connectivity
   - Ensure API key has real-time API access

3. **Audio Not Playing**
   - Check browser audio permissions
   - Verify audio output device
   - Try refreshing the page

4. **Docker Issues**
   - Ensure Docker daemon is running
   - Check port 3000 is available
   - Verify environment variables are set

### Debug Mode

To run in development mode with detailed logging:

```bash
# Modify docker-compose.yml
environment:
  - NODE_ENV=development

# Or run locally
npm install
npm run dev
```

## Security Considerations

- Never commit `.env` files with real API keys
- Use HTTPS in production for secure WebSocket connections
- Implement rate limiting for production deployments
- Consider adding authentication for multi-user scenarios

## Browser Compatibility

- Chrome 66+ (recommended)
- Firefox 60+
- Safari 11.1+
- Edge 79+

*Note: WebRTC and MediaRecorder API support required*

## Performance Tips

- Use wired internet connection for best latency
- Close unnecessary browser tabs
- Use Chrome for optimal WebRTC performance
- Consider server location proximity to OpenAI endpoints

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- Check the troubleshooting section
- Review browser console for errors
- Verify OpenAI API status
- Check Docker logs for server-side issues
