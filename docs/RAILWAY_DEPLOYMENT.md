# Railway Deployment Guide

This guide explains how to deploy the Voice AI Agent to Railway.app.

## Prerequisites

1. **Railway Account**: Sign up at https://railway.app
2. **GitHub Repository**: Already pushed to https://github.com/klogins-hash/voicechat-agent
3. **LiveKit Server**: You'll need a LiveKit server in the cloud
   - Sign up at https://livekit.io for managed hosting
   - Or deploy your own LiveKit server instance
4. **API Keys**: Ensure you have valid API keys for:
   - OpenAI
   - Deepgram
   - Cartesia

## Architecture

The deployment consists of two services:

```
┌─────────────────────────────────────────┐
│         Railway Services                │
├─────────────────────────────────────────┤
│                                         │
│  Frontend (Next.js)                     │
│  - Serves React UI                      │
│  - Connects to LiveKit                  │
│  - Port: 3000                           │
│                                         │
│  Backend Agent (Node.js)                │
│  - LiveKit Agents worker                │
│  - Registers with LiveKit server        │
│  - Handles voice conversations          │
│  - Calls direct APIs (GPT, Deepgram)   │
│                                         │
└─────────────────────────────────────────┘
         ↓               ↓
    ┌────────────┐  ┌──────────────┐
    │  LiveKit   │  │  AI Services │
    │  Cloud     │  │ (OpenAI,     │
    │  Server    │  │  Deepgram,   │
    │            │  │  Cartesia)   │
    └────────────┘  └──────────────┘
```

## Deployment Steps

### Step 1: Connect GitHub Repository to Railway

1. Go to https://railway.app/dashboard
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Connect your GitHub account and select `voicechat-agent` repository
5. Click "Deploy"

### Step 2: Create Frontend Service

1. In your Railway project, click "New"
2. Select "Empty Service"
3. Name it `frontend`
4. In the service settings:
   - Set up the GitHub connection if not already done
   - Configure build:
     - Builder: Docker
     - Dockerfile path: `frontend/Dockerfile`
   - Or use nixpacks if Railway auto-detects

### Step 3: Create Backend Service

1. Click "New" to add another service
2. Select "Empty Service"
3. Name it `voicechat-agent`
4. In the service settings:
   - GitHub connection: same repository
   - Configure build:
     - Builder: Docker
     - Dockerfile path: `voicechat/Dockerfile`
   - Set start command: `pnpm start`

### Step 4: Configure Environment Variables

#### Frontend Service
Add these variables:
```
NEXT_PUBLIC_LIVEKIT_URL=wss://your-livekit-cloud-url.com
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
NEXT_PUBLIC_API_URL=https://your-backend-service.railway.app
```

#### Backend (voicechat-agent) Service
Add these variables:
```
LIVEKIT_URL=wss://your-livekit-cloud-url.com
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
OPENAI_API_KEY=your-openai-api-key
DEEPGRAM_API_KEY=your-deepgram-api-key
CARTESIA_API_KEY=your-cartesia-api-key
NODE_ENV=production
```

### Step 5: Configure Services to Communicate

1. In Railway, link the services:
   - Add environment variable aliases so services can reference each other
   - Frontend needs to know the backend URL (set in `NEXT_PUBLIC_API_URL`)

### Step 6: Set up Domains

1. For **Frontend**:
   - Railway automatically assigns a domain
   - You can also add a custom domain in the settings

2. For **Backend**:
   - Railway will provide an internal service URL for inter-service communication
   - Add environment variables to the frontend pointing to this URL

### Step 7: Configure Ports

**Frontend (Next.js)**:
- Listen on: `3000` (Railway will expose on `PORT` environment variable)

**Backend (Agent)**:
- Listen on: `8080` (can be configured, but doesn't need external exposure)

### Step 8: Deploy and Verify

1. Push code to the `master` branch
2. Railway will automatically trigger deployments
3. Monitor logs in Railway dashboard
4. Test the application:
   - Visit the frontend URL
   - Click "START CALL"
   - Verify voice conversation flows through LiveKit

## Troubleshooting

### Agent Not Registering with LiveKit
- Check `LIVEKIT_URL` is correct and accessible
- Verify `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`
- Check backend logs for connection errors

### Frontend Can't Connect
- Verify `NEXT_PUBLIC_LIVEKIT_URL` points to correct LiveKit server
- Check CORS settings if needed
- Verify API keys are correct

### AI Services Not Working
- Verify all API keys are set and valid:
  - `OPENAI_API_KEY` - Check with OpenAI dashboard
  - `DEEPGRAM_API_KEY` - Check with Deepgram dashboard
  - `CARTESIA_API_KEY` - Check with Cartesia dashboard
- Check API quota limits

### Build Failures
- Ensure `pnpm` versions match locally and in container
- Check Node.js version requirements (22.0.0 or higher)
- Review build logs in Railway dashboard

## LiveKit Cloud Setup

If not already set up, create a LiveKit account:

1. Go to https://livekit.io
2. Sign up and create a project
3. Get your server URL (e.g., `wss://project.livekit.cloud`)
4. Generate API keys in the dashboard
5. Add these to Railway environment variables

## Local Testing Before Railway

Before deploying to Railway, test locally:

1. Ensure Docker is running
2. Start local LiveKit: `docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882 livekit/livekit-server`
3. Update `.env.local` files with local URLs
4. Run: `npm run dev` in both `voicechat` and `frontend` directories
5. Test the application

## Post-Deployment Checklist

- [ ] Frontend is accessible at public URL
- [ ] Can load the START CALL button
- [ ] Can initiate voice conversations
- [ ] Audio flows through LiveKit
- [ ] AI responses are generated correctly
- [ ] Check Railway logs for any errors
- [ ] Monitor service health and performance

## Scaling Considerations

For production:

1. **Backend Replicas**: Keep at 1 initially, can scale based on load
2. **Database**: If adding persistence, configure PostgreSQL plugin in Railway
3. **Caching**: Consider Redis for session management if needed
4. **Monitoring**: Enable Railway logdrains to external monitoring services

## Support and Documentation

- Railway Docs: https://docs.railway.app
- LiveKit Docs: https://docs.livekit.io
- Next.js Deployment: https://nextjs.org/docs/deployment
- LiveKit Agents: https://docs.livekit.io/agents

## Environment Variable Reference

See `.env.example` files in:
- `voicechat/.env.example` - Backend configuration
- `frontend/.env.example` - Frontend configuration

Copy these templates and fill with your actual values for Railway deployment.
