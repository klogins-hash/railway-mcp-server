# MinIO + Queue-Based Architecture for Scalable Document Processing

## Architecture Overview

**Smart separation of concerns:**
- **Upload Layer:** MinIO (object storage) - instant, scalable
- **Queue Layer:** Message broker (Redis/Bull) - distributes work
- **Processing Layer:** Distributed workers - parallel execution
- **Result Storage:** PostgreSQL + Valkey - final data

```
┌──────────────────────────────────────────────────────┐
│              FILE UPLOAD ENDPOINT                    │
│         (Express.js + Multer)                        │
└──────────────────────────────────────────────────────┘
                      ↓
          (Save immediately to MinIO)
                      ↓
┌──────────────────────────────────────────────────────┐
│   MinIO Object Storage                               │
│   ├─ raw/                     (original files)       │
│   ├─ extracted/               (parsed elements)      │
│   └─ enriched/                (final results)        │
└──────────────────────────────────────────────────────┘
                      ↓
        (Queue job for processing)
                      ↓
┌──────────────────────────────────────────────────────┐
│   Message Queue (Bull/Redis)                         │
│   ├─ unstructured_queue                             │
│   ├─ agent_queue                                     │
│   └─ enrichment_queue                                │
└──────────────────────────────────────────────────────┘
                      ↓
        (Distributed workers consume)
                      ↓
    ┌───────────────┬─────────────┬──────────────┐
    ↓               ↓             ↓              ↓
┌─────────┐   ┌────────┐   ┌──────────┐   ┌──────────┐
│Unstructured│ │Agent   │   │Enrichment│   │Validation│
│Worker     │  │Worker  │   │Worker    │   │Worker    │
└─────────┘   └────────┘   └──────────┘   └──────────┘
    ↓               ↓             ↓              ↓
    └───────────────┬─────────────┬──────────────┘
                    ↓
        ┌─────────────────────────┐
        │    PostgreSQL + Valkey  │
        │  (Structured Results)   │
        └─────────────────────────┘
```

---

## Implementation Components

### 1. MinIO Integration

**File:** `src/minio-client.ts`

```typescript
import * as Minio from 'minio';

class MinIOClient {
  private client: Minio.Client;

  constructor() {
    this.client = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT || '9000'),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY!,
      secretKey: process.env.MINIO_SECRET_KEY!,
    });
  }

  // Upload file to MinIO
  async uploadFile(
    bucket: string,
    objectName: string,
    buffer: Buffer,
    metadata?: Record<string, string>
  ): Promise<{ path: string; size: number; etag: string }> {
    const result = await this.client.putObject(
      bucket,
      objectName,
      buffer,
      buffer.length,
      metadata
    );
    return {
      path: `s3://${bucket}/${objectName}`,
      size: buffer.length,
      etag: result.etag,
    };
  }

  // Download file from MinIO
  async downloadFile(bucket: string, objectName: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      this.client.getObject(bucket, objectName, (err, stream) => {
        if (err) return reject(err);
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    });
  }

  // List files
  async listFiles(bucket: string, prefix: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const files: string[] = [];
      const stream = this.client.listObjects(bucket, prefix);
      stream.on('data', obj => files.push(obj.name));
      stream.on('end', () => resolve(files));
      stream.on('error', reject);
    });
  }

  // Initialize buckets
  async ensureBuckets(): Promise<void> {
    const buckets = ['raw', 'extracted', 'enriched'];
    for (const bucket of buckets) {
      const exists = await this.client.bucketExists(bucket);
      if (!exists) {
        await this.client.makeBucket(bucket, 'us-east-1');
      }
    }
  }
}

export default new MinIOClient();
```

### 2. Queue System (Bull Queue)

**File:** `src/queue-manager.ts`

```typescript
import Queue from 'bull';

interface ProcessingJob {
  fileId: string;
  fileName: string;
  format: string;
  minioPath: string;
  uploadTime: Date;
  instructions?: string;
}

// Create queues
const unstructuredQueue = new Queue('unstructured', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
});

const agentQueue = new Queue('agent-processing', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
});

const enrichmentQueue = new Queue('enrichment', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
});

class QueueManager {
  // Submit file for Unstructured.io processing
  async queueForUnstructured(job: ProcessingJob): Promise<string> {
    const queuedJob = await unstructuredQueue.add(job, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: true,
    });
    return queuedJob.id.toString();
  }

  // Submit parsed data for agent processing
  async queueForAgent(
    fileId: string,
    parsedElements: any[],
    instructions: string
  ): Promise<string> {
    const queuedJob = await agentQueue.add({
      fileId,
      parsedElements,
      instructions,
    }, {
      attempts: 2,
      removeOnComplete: true,
    });
    return queuedJob.id.toString();
  }

  // Submit for enrichment
  async queueForEnrichment(
    fileId: string,
    enrichmentConfig: any
  ): Promise<string> {
    const queuedJob = await enrichmentQueue.add({
      fileId,
      config: enrichmentConfig,
    });
    return queuedJob.id.toString();
  }

  // Get job status
  async getJobStatus(queueName: string, jobId: string) {
    const queue = this.getQueue(queueName);
    const job = await queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    const progress = job.progress();

    return {
      state,
      progress,
      attempts: job.attemptsMade,
      data: job.data,
      result: job.returnvalue,
      failedReason: job.failedReason,
    };
  }

  private getQueue(name: string) {
    const queues: Record<string, Queue.Queue> = {
      unstructured: unstructuredQueue,
      agent: agentQueue,
      enrichment: enrichmentQueue,
    };
    return queues[name] || unstructuredQueue;
  }
}

export const queueManager = new QueueManager();
export { unstructuredQueue, agentQueue, enrichmentQueue };
```

### 3. Updated Upload Endpoint

**File:** `src/index-csv-enhanced.ts` (Modified)

```typescript
// NEW: Import MinIO and Queue
import minIOClient from './minio-client.js';
import { queueManager } from './queue-manager.js';

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

      // 1. SAVE TO MINIO IMMEDIATELY
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
      const fileRecord = await postgres.query(
        `INSERT INTO files (id, name, format, minio_path, status, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING *`,
        [fileId, fileName, format, minioPath.path, 'uploaded']
      );

      // 3. QUEUE FOR PROCESSING
      let jobIds = {};

      if (format === 'ZIP') {
        // Queue ZIP extraction
        jobIds.extraction = await queueManager.queueForUnstructured({
          fileId,
          fileName,
          format,
          minioPath: minioPath.path,
          uploadTime: new Date(),
        });
      } else {
        // Queue single file for Unstructured.io
        jobIds.unstructured = await queueManager.queueForUnstructured({
          fileId,
          fileName,
          format,
          minioPath: minioPath.path,
          uploadTime: new Date(),
        });
      }

      // 4. RETURN IMMEDIATELY (async processing)
      res.json({
        success: true,
        fileId,
        format,
        minioPath: minioPath.path,
        jobIds,
        message: `✅ File saved to MinIO. Processing queued.`,
        _links: {
          status: `/files/${fileId}/status`,
          jobs: `/files/${fileId}/jobs`,
        },
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({
        error: "File upload failed",
        details: error.message,
      });
    }
  }
);

// NEW: Get file processing status
app.get(
  "/files/:fileId/status",
  authenticateApiKey,
  async (req: Request, res: Response) => {
    try {
      const { fileId } = req.params;
      const result = await postgres.query(
        `SELECT * FROM files WHERE id = $1`,
        [fileId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "File not found" });
      }

      const file = result.rows[0];
      const jobsResult = await postgres.query(
        `SELECT * FROM processing_jobs WHERE file_id = $1`,
        [fileId]
      );

      res.json({
        file,
        jobs: jobsResult.rows,
        _links: {
          download: `/files/${fileId}/download`,
          results: `/files/${fileId}/results`,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// NEW: Download processed file
app.get(
  "/files/:fileId/download",
  authenticateApiKey,
  async (req: Request, res: Response) => {
    try {
      const { fileId } = req.params;
      const result = await postgres.query(
        `SELECT * FROM files WHERE id = $1`,
        [fileId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "File not found" });
      }

      const file = result.rows[0];
      const buffer = await minIOClient.downloadFile('raw', `${fileId}/${file.name}`);

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${file.name}"`
      );
      res.send(buffer);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);
```

### 4. Worker Processes

**File:** `src/workers/unstructured-worker.ts`

```typescript
import { unstructuredQueue } from '../queue-manager.js';
import minIOClient from '../minio-client.js';
import { callUnstructured } from '../unstructured.js';
import postgres from '../postgres.js';

unstructuredQueue.process(async job => {
  const { fileId, fileName, minioPath } = job.data;

  try {
    job.progress(10);

    // 1. Download from MinIO
    const [bucket, ...pathParts] = minioPath.split('/').slice(2);
    const objectPath = pathParts.join('/');
    const buffer = await minIOClient.downloadFile(bucket, objectPath);

    job.progress(20);

    // 2. Process with Unstructured.io
    const elements = await callUnstructured(buffer, fileName);

    job.progress(50);

    // 3. Save parsed elements to MinIO
    const extractedPath = await minIOClient.uploadFile(
      'extracted',
      `${fileId}/elements.json`,
      Buffer.from(JSON.stringify(elements))
    );

    job.progress(70);

    // 4. Queue for agent processing
    await queueManager.queueForAgent(
      fileId,
      elements,
      job.data.instructions || ''
    );

    job.progress(90);

    // 5. Update database
    await postgres.query(
      `INSERT INTO processing_jobs
       (file_id, job_id, type, status, minio_output)
       VALUES ($1, $2, $3, $4, $5)`,
      [fileId, job.id, 'unstructured', 'completed', extractedPath.path]
    );

    job.progress(100);

    return {
      fileId,
      elementsCount: elements.length,
      extractedPath: extractedPath.path,
    };
  } catch (error: any) {
    // Update database with error
    await postgres.query(
      `INSERT INTO processing_jobs
       (file_id, job_id, type, status, error)
       VALUES ($1, $2, $3, $4, $5)`,
      [fileId, job.id, 'unstructured', 'failed', error.message]
    );
    throw error;
  }
});

// Export for startup
export default unstructuredQueue;
```

**File:** `src/workers/agent-worker.ts`

```typescript
import { agentQueue } from '../queue-manager.js';
import minIOClient from '../minio-client.js';
import { intelligentDocumentAgent } from '../agents/index.js';
import postgres from '../postgres.js';

agentQueue.process(async job => {
  const { fileId, parsedElements, instructions } = job.data;

  try {
    job.progress(10);

    // 1. Run Strands agent
    const agentResult = await intelligentDocumentAgent.process({
      elements: parsedElements,
      instructions,
      context: {
        fileId,
        maxE2BUsage: 3,
        timeout: 300000,
      },
    });

    job.progress(50);

    // 2. Save agent results to MinIO
    const resultsPath = await minIOClient.uploadFile(
      'extracted',
      `${fileId}/agent-analysis.json`,
      Buffer.from(JSON.stringify(agentResult))
    );

    job.progress(75);

    // 3. Queue for enrichment if needed
    if (agentResult.needsEnrichment) {
      await queueManager.queueForEnrichment(fileId, {
        agentDecisions: agentResult.decisions,
      });
    }

    job.progress(90);

    // 4. Update database
    await postgres.query(
      `INSERT INTO processing_jobs
       (file_id, job_id, type, status, minio_output, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        fileId,
        job.id,
        'agent',
        'completed',
        resultsPath.path,
        JSON.stringify({
          confidence: agentResult.confidence,
          decisionsCount: agentResult.decisions.length,
        }),
      ]
    );

    job.progress(100);

    return agentResult;
  } catch (error: any) {
    await postgres.query(
      `INSERT INTO processing_jobs
       (file_id, job_id, type, status, error)
       VALUES ($1, $2, $3, $4, $5)`,
      [fileId, job.id, 'agent', 'failed', error.message]
    );
    throw error;
  }
});

export default agentQueue;
```

---

## Database Schema

```sql
-- Files table
CREATE TABLE files (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  format VARCHAR(50),
  minio_path VARCHAR(500) NOT NULL,
  status VARCHAR(50) DEFAULT 'uploaded',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Processing jobs tracking
CREATE TABLE processing_jobs (
  id SERIAL PRIMARY KEY,
  file_id VARCHAR(255),
  job_id VARCHAR(255),
  type VARCHAR(50), -- 'unstructured', 'agent', 'enrichment'
  status VARCHAR(50), -- 'pending', 'processing', 'completed', 'failed'
  minio_output VARCHAR(500),
  error TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (file_id) REFERENCES files(id)
);

-- Raw extracted data
CREATE TABLE extracted_elements (
  id SERIAL PRIMARY KEY,
  file_id VARCHAR(255),
  element_json JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (file_id) REFERENCES files(id)
);
```

---

## Environment Variables

```bash
# MinIO
MINIO_ENDPOINT=minio.example.com
MINIO_PORT=9000
MINIO_USE_SSL=true
MINIO_ACCESS_KEY=your_access_key
MINIO_SECRET_KEY=your_secret_key

# Queue (Bull/Redis)
REDIS_HOST=localhost
REDIS_PORT=6379
QUEUE_PROCESSING_CONCURRENCY=5

# Unstructured.io
UNSTRUCTURED_URL=http://unstructured:8000

# LLM for Agents
CLAUDE_API_KEY=sk-...
```

---

## Workflow Example

```
1. CLIENT UPLOAD
   POST /upload with file.pdf

2. SERVER (Immediate)
   ✅ Save to MinIO → s3://raw/uuid/file.pdf
   ✅ Create file record in PostgreSQL
   ✅ Queue unstructured job
   → Return 200 OK with fileId and job IDs

3. UNSTRUCTURED WORKER (Async)
   ✅ Download from MinIO
   ✅ Process with Unstructured.io
   ✅ Save elements to MinIO → s3://extracted/uuid/elements.json
   ✅ Queue agent job
   ✅ Update database

4. AGENT WORKER (Async)
   ✅ Get parsed elements
   ✅ Run Strands agent analysis
   ✅ Save decisions to MinIO
   ✅ Decide: Need E2B? Queue enrichment
   ✅ Update database

5. ENRICHMENT WORKER (Async - Optional)
   ✅ Execute E2B transformations
   ✅ Store final results
   ✅ Save to enriched bucket

6. CLIENT POLLING
   GET /files/{fileId}/status
   → Check job statuses, progress, results
```

---

## Benefits of This Architecture

| Aspect | Benefit |
|--------|---------|
| **Scalability** | Separate storage from compute; workers scale independently |
| **Resilience** | Queue retries with exponential backoff; worker failures don't lose data |
| **Speed** | Upload returns immediately; processing happens async |
| **Cost** | Pay for storage + workers, not long-lived processes |
| **Auditability** | Every job tracked in database + MinIO |
| **Parallelism** | Multiple workers process different files simultaneously |
| **Visibility** | Client can poll status anytime |

---

## Monitoring & Observability

```typescript
// Queue health
unstructuredQueue.on('completed', job => {
  console.log(`✅ Job ${job.id} completed: ${job.returnvalue}`);
});

unstructuredQueue.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} failed: ${err.message}`);
});

// Get queue stats
const counts = await unstructuredQueue.counts();
console.log(`
  Active: ${counts.active}
  Waiting: ${counts.wait}
  Completed: ${counts.completed}
  Failed: ${counts.failed}
`);
```

---

## This Is The Scalable Way ✅

You now have:
1. **MinIO** = Infinite, cheap file storage
2. **Bull Queues** = Distributed processing
3. **Workers** = Parallel execution
4. **Database** = Audit trail
5. **Agents + E2B** = Intelligent transformation

This is production-ready, enterprise-scale architecture!

---

*Architecture: November 13, 2025*
*Status: Ready for Implementation*
