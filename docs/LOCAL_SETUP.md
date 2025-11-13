# Local LiveKit Voice Chat Setup

## Overview
Run everything locally with:
- Local LiveKit server (Docker)
- Local voice agent (Node.js)
- Local frontend (React/Next.js)

All communication happens locally with LiveKit as the transport layer.

---

## Prerequisites
- Docker installed
- Node.js 24+
- pnpm

---

## Step 1: Start Local LiveKit Server

### Option A: Using Docker (Recommended)

```bash
# Pull and run LiveKit server
docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp \
  livekit/livekit-server \
  --keys=devkey:secret --bind-addresses=0.0.0.0
```

This starts LiveKit on:
- WebRTC: ws://localhost:7880
- API: http://localhost:7880
- Credentials: key=devkey, secret=secret

### Option B: Manual Installation

```bash
# Download and run LiveKit
wget https://github.com/livekit/livekit/releases/download/v1.6.0/livekit-server-v1.6.0-linux-amd64.tar.gz
tar -xzf livekit-server-v1.6.0-linux-amd64.tar.gz
./livekit-server --keys=devkey:secret
```

---

## Step 2: Configure Backend Agent

Update `/Users/franksimpson/Desktop/voicechat/.env.local`:

```env
# Local LiveKit Server
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret

# AI Service API Keys
OPENAI_API_KEY=sk-proj-...
DEEPGRAM_API_KEY=...
CARTESIA_API_KEY=...

NODE_ENV=development
PORT=3001
```

---

## Step 3: Configure Frontend

Update `/Users/franksimpson/Desktop/frontend/.env.local`:

```env
# Local LiveKit Server
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
LIVEKIT_URL=ws://localhost:7880

NEXT_PUBLIC_APP_CONFIG_ENDPOINT=
SANDBOX_ID=
```

---

## Step 4: Run Services

### Terminal 1: LiveKit Server
```bash
docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp \
  livekit/livekit-server \
  --keys=devkey:secret --bind-addresses=0.0.0.0
```

### Terminal 2: Backend Agent
```bash
cd /Users/franksimpson/Desktop/voicechat
pnpm run dev
```

Expected output:
```
[info] starting worker
[info] Server is listening on port 60024
[info] registered worker
```

### Terminal 3: Frontend
```bash
cd /Users/franksimpson/Desktop/frontend
pnpm dev
```

Expected output:
```
✓ Ready in 843ms
```

---

## Step 5: Test

1. Open: http://localhost:3000
2. Click "START CALL"
3. Allow mic access
4. Speak to the agent
5. Agent responds

---

## Architecture

```
┌──────────────┐
│  Desktop Mac │
└──────┬───────┘
       │
       ├─────────────────────────┬──────────────────┬──────────────────┐
       │                         │                  │                  │
       ↓                         ↓                  ↓                  ↓
   ┌────────┐             ┌──────────────┐    ┌────────────┐    ┌──────────┐
   │Frontend│             │LiveKit Server│    │   Agent    │    │APIs      │
   │:3000   │◄────────────►│  :7880       │◄──►│   :60024   │───►│OpenAI    │
   └────────┘  WebRTC     │  (Docker)    │    │ (Node.js)  │    │Deepgram │
               ws://       └──────────────┘    └────────────┘    │Cartesia │
               localhost                                          └──────────┘
                :7880

All running locally!
```

---

## Key Differences from Cloud Setup

| Aspect | Local | Cloud |
|--------|-------|-------|
| LiveKit Server | Docker on Mac (localhost:7880) | LiveKit Cloud URL |
| Agent Connection | Local worker | Cloud worker |
| Frontend Connection | localhost WebRTC | Cloud WebRTC |
| Data residency | 100% local | On servers |
| Scaling | Single machine | Auto-scaling |
| Privacy | Private | Shared infrastructure |

---

## Advantages of Local Setup

✅ Everything on your machine
✅ No external infrastructure required
✅ Faster latency
✅ Better for development/testing
✅ Complete privacy
✅ Easy to modify and debug

---

## Troubleshooting

### "Connection refused" on port 7880
- Docker may not be running
- Port may already be in use: `lsof -i :7880`
- Try different port: `docker run --rm -p 8880:7880 ...`

### Agent can't connect to LiveKit
- Verify LIVEKIT_URL is `ws://localhost:7880`
- Check Docker container is running: `docker ps`
- Verify credentials: key=devkey, secret=secret

### Frontend can't connect
- Check browser console (F12) for errors
- Verify LIVEKIT_URL in frontend .env.local
- Try clearing browser cache

---

## Next: Deploy to Production

Once tested locally, you can:
1. Deploy LiveKit server to cloud VM
2. Deploy agent to cloud VM or serverless
3. Deploy frontend to Vercel/Netlify
4. Point to cloud LiveKit instance

---

## Resources

- LiveKit Docker: https://hub.docker.com/r/livekit/livekit-server
- LiveKit Docs: https://docs.livekit.io/
- Agent Deployment: https://docs.livekit.io/agents/ops/deployment/
- LocalStack Alternative: https://docs.livekit.io/home/self-hosting/deployment/
