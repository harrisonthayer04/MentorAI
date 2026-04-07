# MentorAI

A modern AI-powered teaching assistant with voice interaction, image generation, persistent memory, and multi-model support.

![Next.js](https://img.shields.io/badge/Next.js-15.5-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-38B2AC?logo=tailwind-css)
![Prisma](https://img.shields.io/badge/Prisma-6.14-2D3748?logo=prisma)

## Features

### Multi-Model AI Chat
- Support for multiple AI models via OpenRouter:
  - **Anthropic**: Claude Sonnet 4.6, Claude Opus 4.6, Claude Haiku 4.5
  - **Google**: Gemini 3.1 Pro Preview, Gemini 3.1 Flash Lite Preview, Gemini 2.5 Flash
  - **OpenAI**: GPT-5.4, GPT-5.4 Mini, GPT-5.4 Nano
  - **xAI**: Grok 4.20, Grok 4.20 Multi-Agent, Grok 4.1 Fast

### Image Generation
- Generate images from text prompts using multimodal models
- Support for multiple image generation models (Google Gemini + OpenAI GPT Image)
- Full-featured image viewer with zoom, pan, download, and clipboard copy

### Vision Support
- Send images to vision-capable models (Claude, Gemini, Grok)
- Paste images directly or drag-and-drop
- Automatic image compression for optimal performance

### Voice Interaction
- **Voice Input**: Hold-to-talk voice recording with automatic transcription
- **Text-to-Speech**: AI responses are spoken aloud using ElevenLabs TTS
- Adjustable playback speed (0.75x - 1.5x)
- Auto-send transcription option

### Persistent Memory
- AI automatically saves important user preferences and facts
- Memories are used to personalize future conversations
- Automatic memory consolidation to prevent duplicates
- Manual memory management in settings

### Conversation Management
- Automatic conversation titling by AI
- Conversation history with search
- Delete conversations
- Seamless switching between chats

### Customization
- Light/Dark theme toggle
- 8 accent color presets + custom color picker
- Modern, responsive UI design

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js with Google OAuth
- **AI**: OpenRouter API (multi-provider)
- **TTS**: ElevenLabs API
- **Transcription**: OpenAI Whisper via OpenRouter

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database (or use Prisma Accelerate)
- OpenRouter API key
- Google OAuth credentials
- ElevenLabs API key (optional, for TTS)

### Environment Variables

Create a `.env` file in the root directory:

```env
# Database
PRISMA_DATABASE_URL="postgresql://..."

# Authentication
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# AI Services
OPENROUTER_API_KEY="your-openrouter-api-key"

# Text-to-Speech (optional)
ELEVENLABS_API_KEY="your-elevenlabs-api-key"
```

### Installation

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate deploy

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the app.

### Production Build

```bash
npm run build
npm start
```

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/          # NextAuth.js routes
│   │   ├── chat/          # Main chat endpoint with tool calling
│   │   ├── conversations/ # Conversation CRUD
│   │   ├── memories/      # Memory management
│   │   ├── messages/      # Message persistence
│   │   ├── transcribe/    # Voice transcription
│   │   ├── tts/           # Text-to-speech
│   │   └── user/          # User settings
│   ├── components/        # Shared UI components
│   ├── dashboard/         # Main chat interface
│   ├── settings/          # User settings page
│   └── signin/            # Authentication page
├── lib/
│   ├── auth.ts            # NextAuth configuration
│   ├── prisma.ts          # Prisma client
│   ├── system-prompt.ts   # AI system prompt
│   └── tts.ts             # TTS utilities
└── types/
    └── next-auth.d.ts     # Type extensions
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Send message to AI with tool calling |
| `/api/conversations` | GET/POST | List/create conversations |
| `/api/conversations/[id]` | GET/PATCH/DELETE | Manage specific conversation |
| `/api/messages` | POST | Save a message |
| `/api/memories` | GET/POST | List/create memories |
| `/api/memories/[id]` | DELETE | Delete a memory |
| `/api/transcribe` | POST | Transcribe audio to text |
| `/api/tts` | POST | Convert text to speech |
| `/api/user` | GET/PATCH | Get/update user settings |

## AI Tools

The AI has access to the following tools:

1. **save_memory**: Store durable user preferences and facts
2. **rename_conversation**: Set a descriptive title for the chat
3. **generate_image**: Create images from text prompts

## Keyboard Shortcuts

### Image Viewer
- `Esc` - Close viewer
- `+` / `=` - Zoom in
- `-` - Zoom out
- `0` - Reset zoom

### Chat
- `Enter` - Send message
- `Shift+Enter` - New line
- `Ctrl/Cmd+V` - Paste image

## License

Private project - All rights reserved.

## Author

Harrison Thayer
Giselle Roman
