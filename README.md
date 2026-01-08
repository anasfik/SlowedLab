SlowedLab

An advanced real-time audio player supporting all effects (slow, reverb) that elevate your music/audio playing to next level

## Features

- 🎚️ Time-stretching with pitch preservation
- 🌊 Professional reverb engine
- 🎵 Real-time audio effects (EQ, compression, distortion)
- 📊 Waveform visualization
- 💾 Preset management
- 💝 100% Free with optional support

## Quick Start with Docker (Recommended)

### Prerequisites

- [Docker](https://www.docker.com/products/docker-desktop) and Docker Compose installed

### Run the Application

```bash
# Clone or navigate to the project directory
cd slowedreverb_own

# Start both frontend and backend services
docker compose up

# Or rebuild if you made changes
docker compose up --build
```

The application will be available at:

- **Frontend**: http://localhost:4000
- **Backend API**: http://localhost:4001

### Stop the Application

```bash
docker compose down
```

## Manual Setup (Development)

### Prerequisites

- Node.js 18+ and npm installed

### Backend

```bash
cd backend
npm install
npm run dev
```

This starts the Express server on **http://localhost:4001**

### Frontend (in a new terminal)

```bash
cd frontend
npm install
npm start
```

This starts the React dev server on **http://localhost:4000**

## Usage

1. **Open the app** at http://localhost:4000
2. **Upload an audio file** using the upload area (supports MP3, WAV, FLAC, OGG, AAC, and more)
3. **Apply effects**:
   - ⚡ **Time Stretch**: Adjust playback speed while preserving pitch
   - ✨ **Reverb**: Add spatial depth and ambient effects
   - **EQ**: Shape frequency response (bass, treble)
   - **Compressor**: Control dynamic range
   - **Distortion**: Add grit and aggression
4. **Preview in real-time** with the interactive waveform viewer
5. **Manage presets** using built-in effect presets or create custom ones
6. **Export** your processed audio as a WAV file
7. **Report bugs** using the 🐞 button for feedback and improvements

## Tech Stack

- **Frontend**: React 18, TypeScript, Web Audio API, Vite
- **Backend**: Node.js, Express, TypeScript
- **Audio Processing**: Web Audio API (100% client-side)
- **Containerization**: Docker & Docker Compose
- **Styling**: CSS3 with modern gradients and animations

## Specifications

- **File Support**: MP3, WAV, FLAC, OGG, AAC, and more
- **File Size Limit**: 200MB per file
- **Processing**: 100% client-side (your files never leave your browser)
- **Storage**: Browser caching via IndexedDB for faster reloads
- **Error Handling**: Comprehensive validation and user-friendly error messages
- **Real-time Performance**: Sub-50ms effect processing
- **UI Responsiveness**: Touch-friendly waveform interactions

## Legal

- [Terms of Service](TERMS.md)
- [MIT License](LICENSE)

## Support

This project is 100% free. If you find it useful, consider [supporting on Ko-fi](https://ko-fi.com/gwhyyy) ☕

---

**Made with ❤️ for audio enthusiasts | SlowedLab - Elevate Your Audio Experience**
