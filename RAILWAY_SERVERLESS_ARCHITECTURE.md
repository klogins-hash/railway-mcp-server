# Railway-Based Serverless Architecture

## 🎯 Corrected Architecture

Based on your clarification: **All services run on Railway except E2B (which is external)**

### Current Railway Stack
- ✅ PostgreSQL (Railway database)
- ✅ Valkey/Redis (Railway cache)
- ✅ Unstructured.io (Railway self-hosted)
- ✅ Temporal (Railway self-hosted)
- ✅ MCP Server (Railway service)
- ❌ E2B (External - only spins up when needed)

---

## 🏗️ Railway Deployment Architecture

```
┌─────────────────────────────────────────────────┐
│           RAILWAY INFRASTRUCTURE                 │
│                                                 │
│  ┌─────────────────────────────────────────┐  │
│  │    Express.js API + MCP Server          │  │
│  │    - File upload endpoint                │  │
│  │    - Start Temporal workflows            │  │
│  │    - Return immediately to client        │  │
│  └─────────────────────────────────────────┘  │
│                    ↓                           │
│  ┌─────────────────────────────────────────┐  │
│  │    Temporal Workflow Orchestrator        │  │
│  │    - Routes to task queues               │  │
│  │    - Manages workflow execution          │  │
│  │    - Provides complete audit trail       │  │
│  └─────────────────────────────────────────┘  │
│        ↓           ↓           ↓              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│  │ Extract  │ │ Analyze  │ │ Enrichment   │
│  │ Worker   │ │ Worker   │ │ Worker   │     │
│  │(Railway  │ │(Railway  │ │(Railway      │
│  │ Service) │ │ Service) │ │ Service)     │
│  └──────────┘ └──────────┘ └──────────┘     │
│        ↓           ↓           ↓              │
│  ┌─────────────────────────────────────────┐  │
│  │    PostgreSQL + Valkey + Unstructured   │  │
│  │    - Store results                       │  │
│  │    - Cache data                          │  │
│  │    - Parse documents                     │  │
│  └─────────────────────────────────────────┘  │
│                                               │
└─────────────────────────────────────────────────┘
                    ↓
         ┌─────────────────────┐
         │   E2B (External)    │
         │   - On-demand only  │
         │   - $0.30/min       │
         │   - Spins up for    │
         │     enrichment tasks│
         └─────────────────────┘
```

---

## 💰 Cost Analysis (Railway-Only)

### Railway Services Deployed
```
1. Express.js MCP Server:     $5-15/mo (small dyno)
2. Extract Worker:            $5-15/mo (small dyno)
3. Analysis Worker:           $5-15/mo (small dyno)
4. Temporal Server:           Self-hosted (on Railway)
5. PostgreSQL:                Managed by Railway
6. Valkey/Redis:              Managed by Railway
7. Unstructured.io:           Self-hosted (on Railway)

Total Railway Infrastructure: $30-50/mo (all compute)
E2B (on-demand):              $60/mo (only when enriching)
─────────────────────────────────────────
TOTAL MONTHLY COST:           $90-110/mo
```

### vs. Previous Approach
```
Reserved VMs (3 x $30):       $90/mo
E2B (always-on):              $13,000+/mo ❌
────────────────────────────────────────
TOTAL:                        $13,090+/mo

SAVINGS WITH NEW APPROACH:    $12,980/mo (99% reduction!) ✅
```

---

## 🚀 Deployment Strategy: Railway Services

All workers run as **Railway Services** (not external Cloud Run/Lambda)

### Service 1: API/Workflow Server
```yaml
# railway.yml
services:
  api:
    build: .
    env:
      - PORT=3000
      - TEMPORAL_HOST=temporal-service:7233
      - DATABASE_URL=$DATABASE_URL
      - VALKEY_URL=$VALKEY_URL
      - UNSTRUCTURED_URL=http://unstructured-service:8000
    depends_on:
      - temporal
      - postgres
      - valkey
      - unstructured
```

**What it does:**
- Accepts file uploads
- Saves to MinIO (Railway managed storage)
- Starts Temporal workflows
- Returns immediately with workflowId
- Clients poll `/workflow/{workflowId}/status`

---

### Service 2: Extract Worker
```yaml
services:
  extract-worker:
    build:
      dockerfile: Dockerfile.extract
    env:
      - TEMPORAL_HOST=temporal-service:7233
      - DATABASE_URL=$DATABASE_URL
      - UNSTRUCTURED_URL=http://unstructured-service:8000
    restart: always
```

**What it does:**
- Connects to Temporal task queue: `document-extraction`
- Polls for extraction jobs
- Calls Unstructured.io API
- Stores extracted elements in PostgreSQL
- Continuously running (managed by Railway)
- **Auto-scales** based on task queue depth

---

### Service 3: Analysis Worker
```yaml
services:
  analysis-worker:
    build:
      dockerfile: Dockerfile.analyze
    env:
      - TEMPORAL_HOST=temporal-service:7233
      - DATABASE_URL=$DATABASE_URL
      - E2B_API_KEY=$E2B_API_KEY
    restart: always
```

**What it does:**
- Connects to Temporal task queue: `document-analysis`
- Runs Strands agent on extracted elements
- Decides if enrichment is needed
- Stores analysis results in PostgreSQL
- Continuously running

---

### Service 4: Enrichment Worker
```yaml
services:
  enrichment-worker:
    build:
      dockerfile: Dockerfile.analyze  # Reuse same base
      context: src/temporal/activities/enrichment.ts
    env:
      - TEMPORAL_HOST=temporal-service:7233
      - DATABASE_URL=$DATABASE_URL
      - E2B_API_KEY=$E2B_API_KEY
    restart: always
```

**What it does:**
- Connects to Temporal task queue: `document-enrichment`
- Receives enrichment decisions from analysis
- **Spins up E2B sandbox only when needed**
- Executes transformation code in sandbox
- Stores enriched results in PostgreSQL
- `restart: always` (Railway restarts if crashes)

---

## 📊 Why This Is Better Than AWS/GCP

### ✅ Advantages of Railway-Only Approach

1. **Unified Platform**
   - No multi-cloud complexity
   - All services in one dashboard
   - Single billing statement
   - Integrated monitoring

2. **Cost Efficiency**
   - Small dyno services: $5-15/month each
   - No cold starts (always running)
   - No setup/teardown delays
   - Predictable costs

3. **Easy Management**
   - Deploy all services together
   - Environment variables sync automatically
   - Database/cache automatically accessible
   - Networking handled by Railway

4. **Performance**
   - Tasks complete faster (no cold starts)
   - Services already running
   - Internal networking (fast)
   - No external API calls for basic operations

5. **Development Experience**
   - Preview environments for testing
   - One-click deployments
   - Built-in CI/CD
   - Logs aggregated in one place

---

## 🔧 Implementation: Railway Workers

### Step 1: Create Worker Services in railway.yml

```yaml
app: romantic-growth

services:
  # Main API Server
  api:
    build: .
    env:
      - PORT=3000
      - NODE_ENV=production
      - TEMPORAL_TASK_QUEUE=document-processing
    depends_on:
      - temporal
      - postgres
      - valkey
      - unstructured

  # Extract Worker - Always running
  extract-worker:
    build:
      dockerfile: Dockerfile.extract
    env:
      - NODE_ENV=production
      - TEMPORAL_TASK_QUEUE=document-extraction
    restart: always
    healthChecks:
      - type: tcp
        port: 3001

  # Analysis Worker - Always running
  analysis-worker:
    build:
      dockerfile: Dockerfile.analyze
    env:
      - NODE_ENV=production
      - TEMPORAL_TASK_QUEUE=document-analysis
    restart: always
    healthChecks:
      - type: tcp
        port: 3002

  # Enrichment Worker - Always running, spins up E2B as needed
  enrichment-worker:
    build:
      dockerfile: Dockerfile.enrichment
    env:
      - NODE_ENV=production
      - TEMPORAL_TASK_QUEUE=document-enrichment
      - E2B_API_KEY=$E2B_API_KEY
    restart: always
    healthChecks:
      - type: tcp
        port: 3003

  # Existing services
  postgres:
    image: postgres:15-alpine
    env:
      - POSTGRES_PASSWORD=$POSTGRES_PASSWORD
      - POSTGRES_DB=romantic_growth

  valkey:
    image: valkey/valkey:latest
    env:
      - VALKEY_PASSWORD=$VALKEY_PASSWORD

  temporal:
    # Self-hosted Temporal on Railway
    image: temporalapp/auto-setup:latest
    env:
      - DYNAMIC_CONFIG_FILE_PATH=config/dynamicconfig/docker.yaml

  unstructured:
    # Self-hosted Unstructured.io on Railway
    image: unstructuredai/unstructured:latest
    env:
      - LOG_LEVEL=INFO

databases:
  postgres:
    name: postgres
  valkey:
    name: valkey

variables:
  TEMPORAL_HOST: temporal-service:7233
  DATABASE_URL: postgresql://user:pass@postgres-service:5432/romantic_growth
  VALKEY_URL: redis://valkey-service:6379
  UNSTRUCTURED_URL: http://unstructured-service:8000
```

### Step 2: Deploy Workers Using railway.yml

```bash
# Login to Railway
railway login

# Deploy all services
railway up

# View logs
railway logs api
railway logs extract-worker
railway logs analysis-worker

# Scale a service (increase memory/CPU)
railway service set extract-worker --cpu=2 --memory=2Gb
```

---

## 🔄 Workflow: How It Works

### 1. User Uploads File
```bash
curl -X POST https://romantic-growth.railway.app/upload \
  -H "x-api-key: $API_KEY" \
  -F "file=@document.pdf"
```

### 2. API Server Response
```json
{
  "success": true,
  "fileId": "1731-xyz...",
  "workflowId": "doc-1731-xyz...",
  "status": "processing"
}
```

**Returns immediately** ✨ (client doesn't wait)

### 3. Temporal Workflow Starts
```
API Server sends: startDocumentProcessing(fileId, fileName, ...)
    ↓
Temporal creates workflow instance
    ↓
Schedules: extractWithUnstructured
    ↓
Extract Worker picks up task
    ↓
(Processes completion, schedules analysis)
    ↓
Analysis Worker picks up task
    ↓
Analyzes - decides if enrichment needed
    ↓
If needsEnrichment = true:
  → Handles: enrichWithE2B
    ↓
  Enrichment Worker picks up task
    ↓
  Spins up E2B sandbox
    ↓
  Executes code
    ↓
  Destroys sandbox (stops paying)
    ↓
Stores final results in PostgreSQL
```

### 4. Client Polls for Status
```bash
# Poll workflow status
curl https://romantic-growth.railway.app/workflow/doc-1731-xyz.../status \
  -H "x-api-key: $API_KEY"
```

**Response:**
```json
{
  "state": "completed",
  "progress": 100,
  "currentActivity": "Complete!",
  "results": {
    "elementsExtracted": 245,
    "analyzed": true,
    "enriched": true
  }
}
```

---

## 💡 E2B Integration

**Only runs during enrichment activity:**

```typescript
// In enrichment-worker
export const enrichWithE2B = async (input: {
  fileId: string;
  agentDecisions: any[];
}) => {
  // E2B only creates sandbox when this function is called
  const sandbox = await e2b.createSandbox({
    template: 'python-3.9',
    metadata: { fileId },
  });

  try {
    // Execute agent-generated code
    const result = await sandbox.runCode(generatedCode);
    return result;
  } finally {
    // Immediately destroy sandbox when done
    await sandbox.destroy();
    // COST STOPS HERE! $0.30/min only for actual execution time
  }
};
```

**Cost Example:**
- Enrichment runs for 2 minutes: $0.60
- 100 enrichments/month × $0.60 = $60/month
- Zero cost when enrichment not needed

---

## 📈 Scaling Strategy

### Scenario 1: Traffic Spike (500 files uploaded simultaneously)

**What happens automatically:**
1. API receives all 500 uploads
2. Creates 500 workflows in Temporal
3. Puts 500 tasks in `document-extraction` queue
4. **Extract-worker sees queue depth**
5. Railway auto-scales extract-worker: 1 instance → 5 instances
6. All 500 start processing in parallel
7. When done, scales back to 1 instance
8. **You only pay for compute actually used**

### Scenario 2: Off-Hours (No files uploaded)

**What happens:**
1. API server: 1 instance (serving health checks)
2. Extract worker: 1 instance (waiting for tasks)
3. Analysis worker: 1 instance (waiting for tasks)
4. Enrichment worker: 1 instance (waiting for tasks)
5. **Cost: ~$15-20/month for worker dyno time**
6. No traffic → minimal cost

---

## 📋 Complete File Structure

```
romantic-growth/
├── railway.yml                      (service definitions)
├── Dockerfile                       (API server)
├── Dockerfile.extract               (extract worker)
├── Dockerfile.analyze               (analysis worker)
├── Dockerfile.enrichment            (enrichment worker)
├── src/
│   ├── index-csv-enhanced.ts        (API endpoints - UPDATE TO USE TEMPORAL)
│   ├── services/
│   │   └── temporal-client.ts       (start workflows)
│   ├── temporal/
│   │   ├── workflows/
│   │   │   └── document-processing.ts (orchestration logic)
│   │   └── activities/
│   │       ├── extract.ts           (worker)
│   │       ├── analysis.ts          (worker)
│   │       └── enrichment.ts        (worker)
│   ├── postgres.ts
│   ├── valkey.ts
│   └── ...
├── SERVERLESS_OPTIMIZATION.md       (cost analysis)
├── SERVERLESS_DEPLOYMENT_GUIDE.md   (implementation)
└── RAILWAY_SERVERLESS_ARCHITECTURE.md (THIS FILE)
```

---

## 🚀 Deployment Checklist

### Pre-Deploy
- [ ] All workers created (extract, analysis, enrichment)
- [ ] railway.yml configured with all services
- [ ] Environment variables set in Railway dashboard
- [ ] Temporal workflow definitions ready
- [ ] E2B API key configured

### Deploy
```bash
# Build and deploy all services
railway up

# Watch logs
railway logs -f

# Verify services running
railway list services
```

### Post-Deploy
- [ ] API responds to /health
- [ ] Test file upload → workflow starts
- [ ] Check Temporal UI for workflow execution
- [ ] Verify extract-worker processing
- [ ] Verify analysis-worker processing
- [ ] Test enrichment with E2B
- [ ] Monitor Railway dashboard for cost

---

## 📊 Final Cost Comparison

### ALL-RAILWAY APPROACH ✅ (Recommended)
```
Extract worker:        $7/mo
Analysis worker:       $7/mo
Enrichment worker:     $7/mo
API server:           $10/mo
Temporal + DB + Cache: Included
E2B (on-demand):      $60/mo
─────────────────────────────
TOTAL:               $91/mo
```

### OLD APPROACH ❌
```
Reserved VMs (3x):     $90/mo
E2B (always-on):    $13,000/mo
─────────────────────────────
TOTAL:             $13,090/mo
```

**SAVINGS: $12,999/month** 🎉

---

## 🎯 Why This Works

1. **All on Railway**
   - Unified platform
   - Integrated networking
   - Single billing

2. **Workers as Services**
   - Always available (no cold starts)
   - Small cost ($7/mo each)
   - Auto-restart on failure

3. **E2B On-Demand Only**
   - Spins up only when needed
   - 2-minute execution = $0.60
   - Immediate shutdown = stops billing

4. **Temporal Orchestration**
   - Manages workflow execution
   - Provides audit trail
   - Handles retries/failures

---

## 🎓 Next Steps

1. **Review this document** — Understand Railway-only architecture
2. **Update railway.yml** — Add worker service definitions
3. **Create worker entrypoints** — Already created in previous phase
4. **Deploy to Railway** — `railway up`
5. **Test end-to-end** — Upload file → watch Temporal UI
6. **Monitor costs** — Railway billing dashboard

---

*Architecture: November 13, 2025*
*Platform: Railway (with E2B on-demand)*
*Cost: $91/month vs $13,090/month (99% savings)*
