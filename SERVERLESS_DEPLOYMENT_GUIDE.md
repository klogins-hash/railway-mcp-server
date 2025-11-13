# Serverless Deployment Implementation Guide

## Overview

This guide walks through deploying the Romantic Growth document processing system using a **hybrid serverless + containers approach**:

- **Extraction & Analysis Activities** → Google Cloud Run (containers with scale-to-zero)
- **Enrichment Activity** → AWS Lambda (true serverless)
- **E2B Sandboxing** → On-demand provisioning (only during enrichment)
- **Workflow Orchestration** → Temporal (self-hosted or Temporal Cloud)

**Expected Cost:** $75-150/month (vs $90+/month for reserved VMs, but with better scaling)

---

## Part 1: Prepare Application for Containerization

### Step 1.1: Create Activity Entrypoints

Currently, activities are defined in the main worker. We need separate entry points for each container.

**File:** `src/temporal/activities/extract.ts`

```typescript
import { Connection, Worker } from '@temporalio/worker';
import * as activities from './index.js';

async function runExtractionWorker() {
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_HOST || 'localhost:7233',
  });

  const worker = await Worker.create({
    connection,
    namespace: 'default',
    taskQueue: 'document-extraction',

    // Only register extraction activities
    activityImplementations: {
      extractWithUnstructured: activities.extractWithUnstructured,
    },

    // Resource allocation for container
    activityFailureHandler: {
      kind: 'ignore',
    },
  });

  console.log('✅ Extraction Worker Started');
  console.log(`   Task Queue: document-extraction`);
  console.log(`   Temporal: ${process.env.TEMPORAL_HOST}`);

  await worker.run();
}

runExtractionWorker().catch(err => {
  console.error('❌ Worker failed:', err);
  process.exit(1);
});
```

**File:** `src/temporal/activities/analysis.ts`

```typescript
import { Connection, Worker } from '@temporalio/worker';
import * as activities from './index.js';

async function runAnalysisWorker() {
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_HOST || 'localhost:7233',
  });

  const worker = await Worker.create({
    connection,
    namespace: 'default',
    taskQueue: 'document-analysis',

    activityImplementations: {
      analyzeWithAgent: activities.analyzeWithAgent,
    },
  });

  console.log('✅ Analysis Worker Started');
  console.log(`   Task Queue: document-analysis`);

  await worker.run();
}

runAnalysisWorker().catch(err => {
  console.error('❌ Worker failed:', err);
  process.exit(1);
});
```

**File:** `src/temporal/activities/enrichment-lambda.ts`

```typescript
// AWS Lambda handler (separate from Temporal)
import { enrichWithE2B } from './index.js';

// Lambda expects exports.handler
export const handler = async (event: any) => {
  try {
    const { fileId, agentDecisions } = JSON.parse(event.body || event);

    const result = await enrichWithE2B({
      fileId,
      agentDecisions,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, result }),
    };
  } catch (error: any) {
    console.error('❌ Enrichment failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
```

### Step 1.2: Update Workflow to Use Remote Task Queues

**File:** `src/temporal/workflows/document-processing.ts` (MODIFIED)

```typescript
import {
  proxyActivities,
  defineSignal,
  defineQuery,
  workflowInfo,
} from '@temporalio/workflow';
import type * as activities from '../activities/index.js';

// Activities will be executed on remote task queues
const extractionActivities = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  taskQueue: 'document-extraction',  // ← Cloud Run container
  retry: {
    initialInterval: '1s',
    maximumInterval: '1m',
    backoffCoefficient: 2,
  },
});

const analysisActivities = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  taskQueue: 'document-analysis',  // ← Cloud Run container
  retry: {
    initialInterval: '1s',
    maximumInterval: '1m',
    backoffCoefficient: 2,
  },
});

const enrichmentActivities = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  taskQueue: 'document-enrichment',  // ← Lambda or Cloud Run
  retry: {
    initialInterval: '1s',
    maximumInterval: '1m',
    backoffCoefficient: 2,
  },
});

const { extractWithUnstructured } = extractionActivities;
const { analyzeWithAgent } = analysisActivities;
const { enrichWithE2B, storeInPostgres } = enrichmentActivities;

// ... rest of workflow code remains the same ...
// Each activity execution will route to correct task queue
```

### Step 1.3: Update package.json Scripts

**File:** `package.json` (MODIFIED sections)

```json
{
  "scripts": {
    "build": "tsc",
    "dev": "ts-node src/index.ts",
    "start": "node dist/index.js",

    "worker:main": "node dist/temporal/worker.ts",
    "worker:extract": "node dist/temporal/activities/extract.js",
    "worker:analyze": "node dist/temporal/activities/analysis.js",

    "docker:build:extract": "docker build -f Dockerfile.extract -t extraction-activity .",
    "docker:build:analyze": "docker build -f Dockerfile.analyze -t analysis-activity .",
    "docker:run:extract": "docker run -e TEMPORAL_HOST=host.docker.internal:7233 extraction-activity",
    "docker:run:analyze": "docker run -e TEMPORAL_HOST=host.docker.internal:7233 analysis-activity"
  }
}
```

---

## Part 2: Containerize Activities

### Step 2.1: Create Extraction Container

**File:** `Dockerfile.extract`

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy only necessary files
COPY package*.json tsconfig.json ./
COPY src/ ./src/

# Install dependencies
RUN npm ci --only=production

# Compile TypeScript
RUN npm run build

# Set environment
ENV NODE_ENV=production
ENV TEMPORAL_TASK_QUEUE=document-extraction

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('healthy')" || exit 1

# Run extraction worker
CMD ["node", "dist/temporal/activities/extract.js"]
```

**File:** `Dockerfile.analyze`

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json tsconfig.json ./
COPY src/ ./src/

RUN npm ci --only=production && npm run build

ENV NODE_ENV=production
ENV TEMPORAL_TASK_QUEUE=document-analysis

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('healthy')" || exit 1

CMD ["node", "dist/temporal/activities/analysis.js"]
```

### Step 2.2: Build and Test Locally

```bash
# Build both images
npm run docker:build:extract
npm run docker:build:analyze

# Run locally (requires Temporal running on localhost:7233)
docker run \
  -e TEMPORAL_HOST=host.docker.internal:7233 \
  -e DATABASE_URL=postgresql://user:pass@host.docker.internal:5432/db \
  -e UNSTRUCTURED_URL=http://host.docker.internal:8000 \
  extraction-activity

# In another terminal
docker run \
  -e TEMPORAL_HOST=host.docker.internal:7233 \
  -e DATABASE_URL=postgresql://user:pass@host.docker.internal:5432/db \
  analysis-activity
```

---

## Part 3: Deploy to Google Cloud Run

### Step 3.1: Setup GCP Project

```bash
# Authenticate with GCP
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable run.googleapis.com
gcloud services enable container.googleapis.com
gcloud services enable artifactregistry.googleapis.com

# Create Artifact Registry repository
gcloud artifacts repositories create docker-repo \
  --repository-format=docker \
  --location=us-central1
```

### Step 3.2: Push Images to Artifact Registry

```bash
# Configure Docker authentication
gcloud auth configure-docker us-central1-docker.pkg.dev

# Build extraction image
docker build -f Dockerfile.extract \
  -t us-central1-docker.pkg.dev/YOUR_PROJECT_ID/docker-repo/extraction-activity:latest .

# Push to registry
docker push us-central1-docker.pkg.dev/YOUR_PROJECT_ID/docker-repo/extraction-activity:latest

# Repeat for analysis
docker build -f Dockerfile.analyze \
  -t us-central1-docker.pkg.dev/YOUR_PROJECT_ID/docker-repo/analysis-activity:latest .

docker push us-central1-docker.pkg.dev/YOUR_PROJECT_ID/docker-repo/analysis-activity:latest
```

### Step 3.3: Deploy to Cloud Run

```bash
# Deploy extraction activity
gcloud run deploy extraction-activity \
  --image us-central1-docker.pkg.dev/YOUR_PROJECT_ID/docker-repo/extraction-activity:latest \
  --platform managed \
  --region us-central1 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 600 \
  --max-instances 10 \
  --min-instances 0 \
  --set-env-vars TEMPORAL_HOST=YOUR_TEMPORAL_SERVER:7233 \
  --set-env-vars DATABASE_URL=$DATABASE_URL \
  --set-env-vars UNSTRUCTURED_URL=$UNSTRUCTURED_URL \
  --no-allow-unauthenticated
```

**Note:** Cloud Run requires HTTP endpoints. For Temporal workers, we need to use **Cloud Tasks** to route activity work.

### Step 3.4: Alternative - Use Cloud Tasks for Routing

Since Temporal workers connect to Temporal server directly, Cloud Run is better for keeping the worker running. Instead, use **Cloud Tasks** + **Cloud Workflows** for HTTP-based routing.

**Recommended:** Keep workers on Compute Engine with auto-scaling instead of Cloud Run, OR use GKE (Kubernetes Engine) with proper worker configuration.

---

## Part 4: Deploy Enrichment to AWS Lambda

### Step 4.1: Create Lambda Handler

**File:** `src/lambda/enrichment-handler.ts`

```typescript
import { APIGatewayProxyHandler } from 'aws-lambda';
import { enrichWithE2B } from '../temporal/activities/index.js';

export const handler: APIGatewayProxyHandler = async (event) => {
  console.log('📨 Enrichment Lambda invoked:', event.path);

  try {
    let input;

    // Parse input from either body or SQS
    if (event.body) {
      input = JSON.parse(event.body);
    } else if (event.Records) {
      // From SQS trigger
      const message = event.Records[0].body;
      input = JSON.parse(message);
    } else {
      throw new Error('Invalid input');
    }

    const { fileId, agentDecisions } = input;

    console.log(`🔄 Processing enrichment for ${fileId}`);

    const result = await enrichWithE2B({
      fileId,
      agentDecisions,
    });

    console.log(`✅ Enrichment complete for ${fileId}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        fileId,
        result,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error: any) {
    console.error('❌ Enrichment error:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message,
        fileId: input?.fileId,
      }),
    };
  }
};
```

### Step 4.2: Create Serverless Framework Config

**File:** `serverless.yml`

```yaml
service: romantic-growth-enrichment

frameworkVersion: '3'

provider:
  name: aws
  runtime: nodejs20.x
  region: us-east-1
  memorySize: 1024
  timeout: 300

  environment:
    DATABASE_URL: ${env:DATABASE_URL}
    E2B_API_KEY: ${env:E2B_API_KEY}
    UNSTRUCTURED_URL: ${env:UNSTRUCTURED_URL}

  iamRoleStatements:
    - Effect: 'Allow'
      Action:
        - 'logs:CreateLogGroup'
        - 'logs:CreateLogStream'
        - 'logs:PutLogEvents'
      Resource: '*'
    - Effect: 'Allow'
      Action:
        - 'sqs:ReceiveMessage'
        - 'sqs:DeleteMessage'
        - 'sqs:GetQueueAttributes'
      Resource: !GetAtt EnrichmentQueue.Arn

functions:
  enrichment:
    handler: dist/lambda/enrichment-handler.handler
    events:
      - http:
          path: /enrich
          method: post
          authorizer:
            type: TOKEN
            identitySource: method.request.header.Authorization
      - sqs:
          arn: !GetAtt EnrichmentQueue.Arn
          batchSize: 10
          batchWindow: 30

resources:
  Resources:
    EnrichmentQueue:
      Type: AWS::SQS::Queue
      Properties:
        QueueName: romantic-growth-enrichment
        VisibilityTimeout: 600
        MessageRetentionPeriod: 86400

plugins:
  - serverless-esbuild
  - serverless-offline

custom:
  esbuild:
    bundle: true
    minify: true
```

### Step 4.3: Deploy to Lambda

```bash
# Install Serverless Framework
npm install -g serverless

# Deploy
serverless deploy \
  --env DATABASE_URL=$DATABASE_URL \
  --env E2B_API_KEY=$E2B_API_KEY

# View logs
serverless logs -f enrichment --tail

# Test locally
serverless offline start
```

---

## Part 5: Setup Temporal Workflow Coordination

### Step 5.1: Create Temporal Client Service

**File:** `src/services/temporal-client.ts`

```typescript
import { Connection, Client } from '@temporalio/client';

let client: Client;

export async function initializeTemporalClient() {
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_HOST || 'localhost:7233',
  });

  client = new Client({
    connection,
    namespace: 'default',
  });

  console.log('✅ Temporal Client initialized');
  return client;
}

export function getTemporalClient(): Client {
  if (!client) {
    throw new Error('Temporal client not initialized');
  }
  return client;
}

export async function startDocumentProcessing(input: {
  fileId: string;
  fileName: string;
  format: string;
  minioPath: string;
  instructions?: string;
}) {
  const client = getTemporalClient();

  // Route enrichment to Lambda if available
  const enrichmentQueue = process.env.LAMBDA_ENRICHMENT_URL
    ? 'lambda-enrichment'
    : 'document-enrichment';

  const handle = await client.workflow.start('documentProcessingWorkflow', {
    args: [
      {
        ...input,
        enrichmentTaskQueue: enrichmentQueue,
      },
    ],
    taskQueue: 'document-processing',
    workflowId: `doc-${input.fileId}`,
    workflowRunTimeout: '1 hour',
    retryPolicy: {
      initialInterval: '1s',
      maximumInterval: '1m',
      backoffCoefficient: 2,
      maximumAttempts: 3,
    },
  });

  return handle;
}
```

### Step 5.2: Update Upload Endpoint

**File:** `src/index.ts` (MODIFIED)

```typescript
import { startDocumentProcessing } from './services/temporal-client.js';
import minIOClient from './services/minio-client.js';

app.post('/upload', authenticateApiKey, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileId = `${Date.now()}-${uuidv4()}`;
    const fileName = req.file.originalname;
    const buffer = req.file.buffer;
    const format = detectFormat(fileName);

    // 1. Save to MinIO
    const minioPath = await minIOClient.uploadFile(
      'raw',
      `${fileId}/${fileName}`,
      buffer,
      { 'original-name': fileName, 'format': format }
    );

    // 2. Create database record
    await postgres.query(
      `INSERT INTO files (id, name, format, minio_path, status, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [fileId, fileName, format, minioPath.path, 'uploaded']
    );

    // 3. Start Temporal workflow
    const handle = await startDocumentProcessing({
      fileId,
      fileName,
      format,
      minioPath: minioPath.path,
      instructions: req.body.instructions,
    });

    res.json({
      success: true,
      fileId,
      format,
      workflowId: handle.workflowId,
      minioPath: minioPath.path,
      _links: {
        status: `/files/${fileId}/status`,
        workflow: `/workflow/${handle.workflowId}/status`,
      },
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

---

## Part 6: Deployment Checklist

### Pre-Deployment (Local Testing)

- [ ] Ensure `npm run build` completes without errors
- [ ] Run `docker build` for both Dockerfile.extract and Dockerfile.analyze
- [ ] Test images locally with Temporal running
- [ ] Verify activity implementations work in isolation
- [ ] Test workflow execution locally

### Cloud Deployment (GCP)

For Cloud Run with Temporal workers:
- [ ] Create Artifact Registry repository
- [ ] Build Docker images with production settings
- [ ] Push images to registry
- [ ] Create Cloud Run services with auto-scaling (min=0, max=10)
- [ ] Set environment variables in Cloud Run
- [ ] Configure Health checks
- [ ] Setup monitoring and logging

### Lambda Deployment (AWS)

- [ ] Setup AWS credentials
- [ ] Create SQS queue for batch enrichment
- [ ] Create IAM role for Lambda
- [ ] Deploy via Serverless Framework
- [ ] Test Lambda function via API Gateway
- [ ] Configure CloudWatch alarms

### Temporal Server

- [ ] Deploy Temporal (self-hosted or Temporal Cloud)
- [ ] Create namespaces (default for production)
- [ ] Register task queues
- [ ] Access Temporal Web UI (localhost:8233)

### Integration

- [ ] Configure Temporal Client to connect to server
- [ ] Setup Temporal Workflow definitions
- [ ] Update all task queue references
- [ ] Test end-to-end file upload → processing → results

---

## Part 7: Monitoring & Scaling

### Cloud Run Monitoring

```bash
# View recent deployments
gcloud run services list

# View logs
gcloud logging read "resource.type=cloud_run_revision" --limit 50 --format json

# Get metrics
gcloud monitoring metrics-descriptors list \
  --filter="metric.type:run.googleapis.com/*"
```

### Lambda Monitoring

```bash
# View Lambda logs
aws logs tail /aws/lambda/enrichment --follow

# Get Lambda metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --start-time 2025-11-13T00:00:00Z \
  --end-time 2025-11-13T23:59:59Z \
  --period 3600 \
  --statistics Sum
```

### Autoscaling Configuration

**Cloud Run:**
```bash
gcloud run services describe extraction-activity --region=us-central1

# Update scaling
gcloud run services update extraction-activity \
  --min-instances 0 \
  --max-instances 20 \
  --region us-central1
```

**Lambda:**
```bash
# Auto-scales automatically based on concurrent executions
# View reserved concurrency
aws lambda get-parameter --name /aws/lambda/enrichment/reserved-concurrency

# Set reserved concurrency
aws lambda put-function-concurrency \
  --function-name enrichment \
  --reserved-concurrent-executions 100
```

---

## Part 8: Cost Monitoring

### Setup Budget Alerts (GCP)

```bash
gcloud billing budgets create \
  --billing-account=BILLING_ACCOUNT_ID \
  --display-name="Romantic Growth Budget" \
  --budget-amount=200 \
  --threshold-rule percent=50 \
  --threshold-rule percent=90
```

### Setup Budget Alerts (AWS)

```bash
aws budgets create-budget \
  --account-id 123456789012 \
  --budget file://budget.json \
  --notifications-with-subscribers file://notifications.json
```

---

## Part 9: Troubleshooting

### Cloud Run Issues

```bash
# Check if Cloud Run service is healthy
curl -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  https://extraction-activity-xxxxx-uc.a.run.app/health

# View cold start performance
gcloud logging read "severity=INFO AND jsonPayload.latency > 5000" --limit 10

# Increase memory for faster cold starts
gcloud run services update extraction-activity \
  --memory 4Gi \
  --region us-central1
```

### Lambda Issues

```bash
# Check Lambda execution role has required permissions
aws iam list-attached-role-policies --role-name enrichment-lambda-role

# View Lambda errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/enrichment \
  --filter-pattern "ERROR"

# Increase timeout if activities are timing out
aws lambda update-function-configuration \
  --function-name enrichment \
  --timeout 600
```

### Temporal Issues

```bash
# Check workflow execution
temporal workflow describe \
  --workflow-id doc-XXXXX

# View workflow history
temporal workflow show \
  --workflow-id doc-XXXXX

# Check task queue stats
temporal task-queue describe --task-queue document-extraction
```

---

## Estimated Timeline

| Phase | Duration | Effort |
|-------|----------|--------|
| Prepare codebase (Step 1) | 1-2 hours | Low |
| Create containers (Step 2) | 1-2 hours | Low |
| Deploy to Cloud Run (Step 3) | 2-3 hours | Medium |
| Deploy to Lambda (Step 4) | 1-2 hours | Low |
| Setup Temporal (Step 5) | 1-2 hours | Medium |
| Integration testing (Step 6) | 2-3 hours | Medium |
| **Total** | **8-14 hours** | **Low-Medium** |

---

## Expected Results

After completing this guide:

✅ Extraction activity running on Cloud Run (scale 0-10 instances)
✅ Analysis activity running on Cloud Run (scale 0-10 instances)
✅ Enrichment running on Lambda (serverless, on-demand)
✅ E2B sandboxes spinning up on-demand during enrichment
✅ All workflows orchestrated by Temporal
✅ Total monthly cost: $75-150 (vs $90+ reserved VMs)
✅ Better scalability for variable workloads
✅ Zero infrastructure management

---

*Deployment Guide: November 13, 2025*
*Recommended Approach: Serverless-First Architecture*
