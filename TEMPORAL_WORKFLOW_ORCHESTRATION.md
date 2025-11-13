# Temporal Workflow Orchestration for Document Processing

## Why Add Temporal?

**Short Answer:** YES! Temporal transforms your system from "queue-based" to "workflow-based" with:

| Aspect | Bull Queues | Temporal |
|--------|------------|----------|
| **Durability** | Single job level | Entire workflow across services |
| **Visibility** | Basic job status | Complete execution history |
| **Retries** | Per-queue | Per-activity with exponential backoff |
| **Timeouts** | Basic | Sophisticated (start-to-close, heartbeat, etc.) |
| **Parallelism** | Manual queueing | Native parallel activities |
| **Compensation** | Manual rollback | Automatic saga patterns |
| **Debugging** | Logs | Complete playback of execution |
| **Scalability** | Worker limited | Unlimited with Temporal cluster |

**Temporal is perfect for your multi-stage pipeline:**
```
Upload (MinIO)
  ↓
Extract (Unstructured)
  ↓
Analyze (Agent)
  ↓ (conditional)
Enrich (E2B)
  ↓
Store (PostgreSQL)
```

---

## Architecture with Temporal

```
┌────────────────────────────────────────────────────┐
│         FILE UPLOAD (Express.js)                   │
│  - Save to MinIO                                   │
│  - Start Temporal Workflow                         │
└────────────────────────────────────────────────────┘
                      ↓
┌────────────────────────────────────────────────────┐
│    TEMPORAL WORKFLOW ORCHESTRATION                 │
│  - Coordinates all processing steps                │
│  - Handles retries, timeouts, failures             │
│  - Maintains complete execution history            │
└────────────────────────────────────────────────────┘
                      ↓
     ┌────────────────┬──────────────────┐
     ↓                ↓                  ↓
┌──────────┐    ┌─────────────┐    ┌──────────┐
│ Extract  │    │   Analyze   │    │ Enrich   │
│Activity  │ → │  Activity   │ → │ Activity │
└──────────┘    └─────────────┘    └──────────┘
     ↓                ↓                  ↓
  MinIO +      PostgreSQL +        E2B +
  Unstructured  Valkey             PostgreSQL
     ↓                ↓                  ↓
     └────────────────┬──────────────────┘
                      ↓
┌────────────────────────────────────────────────────┐
│     Workflow Complete / Failed                     │
│  - Audit trail: Complete execution recorded       │
│  - Results: Available in MinIO + PostgreSQL        │
│  - Visibility: Full history in Temporal UI         │
└────────────────────────────────────────────────────┘
```

---

## Implementation

### 1. Install & Setup

```bash
# Install Temporal CLI
brew install temporal-cli

# Or use Docker
docker run --name temporal -d \
  -p 7233:7233 \
  -p 8233:8233 \
  temporalio/auto-setup:latest

# Install Node SDK
npm install @temporalio/client @temporalio/worker @temporalio/workflow
```

### 2. Define Workflow

**File:** `src/temporal/workflows/document-processing.ts`

```typescript
import {
  proxyActivities,
  defineSignal,
  defineQuery,
  workflowInfo,
} from '@temporalio/workflow';
import type * as activities from '../activities/index.js';

const {
  extractWithUnstructured,
  analyzeWithAgent,
  enrichWithE2B,
  storeInPostgres,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  retry: {
    initialInterval: '1s',
    maximumInterval: '1m',
    backoffCoefficient: 2,
  },
});

export interface DocumentProcessingInput {
  fileId: string;
  fileName: string;
  format: string;
  minioPath: string;
  instructions?: string;
}

export interface ProcessingStatus {
  state: 'extracting' | 'analyzing' | 'enriching' | 'storing' | 'completed' | 'failed';
  progress: number;
  currentActivity: string;
  error?: string;
}

let status: ProcessingStatus = {
  state: 'extracting',
  progress: 0,
  currentActivity: 'Extracting document...',
};

const updateStatusSignal = defineSignal<[Partial<ProcessingStatus>]>('updateStatus');
const statusQuery = defineQuery<ProcessingStatus>('getStatus');

export async function documentProcessingWorkflow(
  input: DocumentProcessingInput
): Promise<any> {
  setHandler(updateStatusSignal, (updates) => {
    status = { ...status, ...updates };
  });

  setQueryHandler(statusQuery, () => status);

  const workflowId = workflowInfo().workflowId;

  try {
    // 1. EXTRACT
    status = { state: 'extracting', progress: 10, currentActivity: 'Extracting with Unstructured.io...' };

    const extractedElements = await extractWithUnstructured({
      fileId: input.fileId,
      fileName: input.fileName,
      minioPath: input.minioPath,
    });

    if (!extractedElements || extractedElements.length === 0) {
      throw new Error('No elements extracted from document');
    }

    // 2. ANALYZE
    status = { state: 'analyzing', progress: 40, currentActivity: 'Analyzing with Agent...' };

    const agentAnalysis = await analyzeWithAgent({
      fileId: input.fileId,
      elements: extractedElements,
      instructions: input.instructions || '',
    });

    // 3. CONDITIONAL ENRICHMENT
    if (agentAnalysis.needsEnrichment) {
      status = { state: 'enriching', progress: 70, currentActivity: 'Enriching with E2B...' };

      const enrichedData = await enrichWithE2B({
        fileId: input.fileId,
        agentDecisions: agentAnalysis.decisions,
      });

      agentAnalysis.enrichedData = enrichedData;
    }

    // 4. STORE
    status = { state: 'storing', progress: 90, currentActivity: 'Storing results...' };

    const result = await storeInPostgres({
      fileId: input.fileId,
      fileName: input.fileName,
      elements: extractedElements,
      analysis: agentAnalysis,
      workflowId,
    });

    status = { state: 'completed', progress: 100, currentActivity: 'Complete!' };

    return {
      workflowId,
      fileId: input.fileId,
      success: true,
      result,
      processedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    status = {
      state: 'failed',
      progress: 0,
      currentActivity: `Failed: ${error.message}`,
      error: error.message,
    };
    throw error;
  }
}
```

### 3. Define Activities

**File:** `src/temporal/activities/index.ts`

```typescript
import { Activity } from '@temporalio/activity';
import minIOClient from '../../minio-client.js';
import { callUnstructured } from '../../unstructured.js';
import { intelligentDocumentAgent } from '../../agents/index.js';
import { executeE2B } from '../../e2b-executor.js';
import postgres from '../../postgres.js';

export const extractWithUnstructured = async (input: {
  fileId: string;
  fileName: string;
  minioPath: string;
}) => {
  try {
    // Download from MinIO
    const [bucket, ...pathParts] = input.minioPath.split('/').slice(2);
    const objectPath = pathParts.join('/');
    const buffer = await minIOClient.downloadFile(bucket, objectPath);

    // Extract using Unstructured.io
    const elements = await callUnstructured(buffer, input.fileName);

    // Save to MinIO
    await minIOClient.uploadFile(
      'extracted',
      `${input.fileId}/elements.json`,
      Buffer.from(JSON.stringify(elements))
    );

    return elements;
  } catch (error: any) {
    throw new Error(`Extraction failed: ${error.message}`);
  }
};

export const analyzeWithAgent = async (input: {
  fileId: string;
  elements: any[];
  instructions: string;
}) => {
  try {
    const result = await intelligentDocumentAgent.process({
      elements: input.elements,
      instructions: input.instructions,
      context: {
        fileId: input.fileId,
        maxE2BUsage: 3,
        timeout: 300000,
      },
    });

    // Save to MinIO
    await minIOClient.uploadFile(
      'extracted',
      `${input.fileId}/agent-analysis.json`,
      Buffer.from(JSON.stringify(result))
    );

    return result;
  } catch (error: any) {
    throw new Error(`Agent analysis failed: ${error.message}`);
  }
};

export const enrichWithE2B = async (input: {
  fileId: string;
  agentDecisions: any[];
}) => {
  try {
    const code = generateE2BCode(input.agentDecisions);
    const result = await executeE2B(code, input);

    // Save to MinIO
    await minIOClient.uploadFile(
      'enriched',
      `${input.fileId}/enrichment.json`,
      Buffer.from(JSON.stringify(result))
    );

    return result;
  } catch (error: any) {
    throw new Error(`E2B enrichment failed: ${error.message}`);
  }
};

export const storeInPostgres = async (input: {
  fileId: string;
  fileName: string;
  elements: any[];
  analysis: any;
  workflowId: string;
}) => {
  try {
    const tableName = sanitizeTableName(input.fileName);

    // Store workflow result
    await postgres.query(
      `INSERT INTO document_workflows
       (workflow_id, file_id, file_name, status, result, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        input.workflowId,
        input.fileId,
        input.fileName,
        'completed',
        JSON.stringify({
          elements: input.elements.length,
          analysis: input.analysis,
        }),
      ]
    );

    return {
      tableName,
      elementsCount: input.elements.length,
      workflowId: input.workflowId,
    };
  } catch (error: any) {
    throw new Error(`Storage failed: ${error.message}`);
  }
};

function generateE2BCode(decisions: any[]): string {
  // Generate Python code based on agent decisions
  // (simplified example)
  return `
import json
decisions = ${JSON.stringify(decisions)}
# Apply transformations based on decisions
result = {"status": "enriched", "decisions_applied": len(decisions)}
print(json.dumps(result))
`;
}

function sanitizeTableName(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .toLowerCase()
    .substring(0, 63);
}
```

### 4. Setup Worker

**File:** `src/temporal/worker.ts`

```typescript
import { Worker } from '@temporalio/worker';
import * as workflows from './workflows/index.js';
import * as activities from './activities/index.js';

async function runWorker() {
  const worker = await Worker.create({
    workflowsPath: require.resolve('./workflows/index.js'),
    activitiesPath: require.resolve('./activities/index.js'),
    taskQueue: 'document-processing',

    // Configure Temporal server connection
    connection: {
      address: process.env.TEMPORAL_HOST || 'localhost:7233',
    },

    // Activity configuration
    activityFailureHandler: {
      kind: 'ignore', // Don't fail workflow on activity failure
    },

    // Define resources
    workflowTypes: [workflows.documentProcessingWorkflow],
    activityImplementations: activities,
  });

  // Run the worker
  await worker.run();
}

runWorker().catch(err => {
  console.error('Worker failed:', err);
  process.exit(1);
});
```

### 5. Start Workflow from Upload Endpoint

**File:** `src/index-csv-enhanced.ts` (Modified)

```typescript
import { Connection, Client } from '@temporalio/client';

// Initialize Temporal client
let temporalClient: Client;

async function initTemporalClient() {
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_HOST || 'localhost:7233',
  });
  temporalClient = new Client({ connection });
}

// Updated /upload endpoint
app.post(
  "/upload",
  authenticateApiKey,
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const fileId = `${Date.now()}-${uuidv4()}`;
      const fileName = req.file.originalname;
      const buffer = req.file.buffer;
      const format = detectFormat(fileName);

      // 1. SAVE TO MINIO
      const minioPath = await minIOClient.uploadFile(
        'raw',
        `${fileId}/${fileName}`,
        buffer,
        {
          'original-name': fileName,
          'upload-time': new Date().toISOString(),
          'format': format,
        }
      );

      // 2. CREATE DATABASE RECORD
      await postgres.query(
        `INSERT INTO files (id, name, format, minio_path, status, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [fileId, fileName, format, minioPath.path, 'uploaded']
      );

      // 3. START TEMPORAL WORKFLOW
      const workflowHandle = await temporalClient.workflow.start(
        'documentProcessingWorkflow',
        {
          args: [{
            fileId,
            fileName,
            format,
            minioPath: minioPath.path,
            instructions: req.body.instructions,
          }],
          taskQueue: 'document-processing',
          workflowId: `doc-${fileId}`,
          retryPolicy: {
            initialInterval: '1s',
            maximumInterval: '1m',
            backoffCoefficient: 2,
            maximumAttempts: 3,
          },
        }
      );

      // 4. RETURN IMMEDIATELY
      res.json({
        success: true,
        fileId,
        format,
        workflowId: workflowHandle.workflowId,
        minioPath: minioPath.path,
        message: `✅ File uploaded. Workflow started.`,
        _links: {
          status: `/files/${fileId}/status`,
          workflow: `/workflow/${workflowHandle.workflowId}/status`,
        },
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({
        error: "Upload failed",
        details: error.message,
      });
    }
  }
);

// NEW: Get workflow status
app.get(
  "/workflow/:workflowId/status",
  authenticateApiKey,
  async (req: Request, res: Response) => {
    try {
      const { workflowId } = req.params;
      const workflowHandle = temporalClient.workflow.getHandle(workflowId);

      const query = await workflowHandle.query('getStatus');

      res.json({
        workflowId,
        status: query,
        _links: {
          workflow: workflowHandle.getWorkflowId(),
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Initialize on startup
app.listen(PORT, async () => {
  await initTemporalClient();
  console.log('✅ Temporal client initialized');
  console.log(`✅ Server running on port ${PORT}`);
});
```

---

## Database Schema

```sql
-- Track Temporal workflows
CREATE TABLE document_workflows (
  id SERIAL PRIMARY KEY,
  workflow_id VARCHAR(255) UNIQUE NOT NULL,
  file_id VARCHAR(255) NOT NULL,
  file_name VARCHAR(255),
  status VARCHAR(50), -- 'running', 'completed', 'failed'
  result JSONB,
  error TEXT,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  FOREIGN KEY (file_id) REFERENCES files(id)
);

-- Workflow execution history
CREATE TABLE workflow_history (
  id SERIAL PRIMARY KEY,
  workflow_id VARCHAR(255),
  event_type VARCHAR(100), -- 'activity_started', 'activity_completed', 'activity_failed'
  activity_name VARCHAR(255),
  details JSONB,
  timestamp TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (workflow_id) REFERENCES document_workflows(workflow_id)
);
```

---

## Benefits of Temporal vs Bull

| Feature | Bull | Temporal |
|---------|------|----------|
| **Workflow Definition** | Code scattered in workers | Single workflow definition |
| **Retries** | Per-queue | Per-activity, sophisticated |
| **Visibility** | Logs | Temporal Web UI + full history |
| **Parallelism** | Manual queueing | Native async/await |
| **Compensation** | Manual | Automatic saga patterns |
| **Testing** | Integration testing | Unit test workflows |
| **Durability** | Queue-level | Distributed ledger |
| **Scaling** | Worker-limited | Temporal Cluster |

---

## Deployment Options

### Option 1: Temporal Cloud (Managed)
```
- Zero infrastructure
- Automatic scaling
- $25/month per workflow
- Best for production
```

### Option 2: Self-Hosted (Docker)
```
docker run --name temporal \
  -d -p 7233:7233 -p 8233:8233 \
  temporalio/auto-setup:latest
```

### Option 3: Kubernetes
```yaml
# Helm chart available
helm install temporal temporaltech/temporal
```

---

## Monitoring & Debugging

**Temporal Web UI** (localhost:8233)
- Real-time workflow monitoring
- Complete execution history
- Activity details and errors
- Workflow testing interface

**Programmatic Monitoring**
```typescript
// Get workflow history
const history = await workflowHandle.fetchHistory();

// Describe workflow
const description = await workflowHandle.describe();

// Check execution
const result = await workflowHandle.result();
```

---

## Architecture Comparison

### Before (Bull Only)
```
Upload → Queue Job → Worker → Result
(linear, limited visibility)
```

### After (Temporal)
```
Upload → Start Workflow → Activity 1 → Activity 2 → Activity 3 (conditional) → Complete
(orchestrated, full visibility, self-healing)
```

---

## Recommendation

**Add Temporal if:**
- ✅ You want enterprise-grade workflow orchestration
- ✅ You need complete execution history & replay
- ✅ You want Temporal Web UI for visibility
- ✅ You expect complex conditional workflows
- ✅ You need distributed transaction support

**Keep Bull only if:**
- ✅ Simple linear workflows
- ✅ Minimal infrastructure
- ✅ Cost-sensitive (Temporal adds overhead)

---

## Implementation Timeline

1. **Install Temporal Server** - 10 min
2. **Define Workflow** - 30 min
3. **Define Activities** - 30 min
4. **Setup Worker** - 20 min
5. **Integrate with Upload** - 30 min
6. **Test end-to-end** - 20 min

**Total: ~2.5 hours**

---

## Cost Comparison

| Component | Bull Only | Bull + Temporal |
|-----------|-----------|-----------------|
| Message Queue (Bull) | $0 (self-hosted) | $0 (self-hosted) |
| Worker Servers | $100-500/mo | $100-500/mo |
| Temporal Server | - | $0 (self-hosted) or $25/mo (Cloud) |
| **Total** | $100-500/mo | $100-525/mo |

**Temporal ROI: Better visibility, error recovery, and debugging = worth the cost**

---

## My Recommendation

**YES, add Temporal!**

Here's why:
1. Your workflow is multi-stage (Extract → Analyze → Enrich → Store)
2. Each stage can fail independently and needs recovery
3. You need visibility into what's happening
4. Agent decisions are conditional (may or may not enrich)
5. Audit trail is critical (regulatory requirement)

Temporal transforms your system from "job queue" to "workflow engine" which is exactly what you need.

**Suggested Stack:**
- MinIO (storage) ✅
- Bull Queues (removed) ❌ → Temporal (orchestration) ✅
- Workers (activities) ✅
- PostgreSQL (audit) ✅

---

*Architecture Update: November 13, 2025*
*Temporal Addition Recommended: YES*
