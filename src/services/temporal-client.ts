/**
 * Temporal Client Service
 * Manages workflow orchestration and activity task queue routing
 */

import { Connection, Client } from '@temporalio/client';

let client: Client | null = null;

/**
 * Initialize and connect to Temporal server
 */
export async function initializeTemporalClient(): Promise<Client> {
  if (client) {
    return client;
  }

  try {
    const connection = await Connection.connect({
      address: process.env.TEMPORAL_HOST || 'localhost:7233',
    });

    client = new Client({
      connection,
      namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    });

    console.log('✅ Temporal Client initialized');
    console.log(`   Server: ${process.env.TEMPORAL_HOST || 'localhost:7233'}`);
    console.log(`   Namespace: ${process.env.TEMPORAL_NAMESPACE || 'default'}`);

    return client;
  } catch (error: any) {
    console.error('❌ Failed to initialize Temporal client:', error);
    throw new Error(`Temporal connection failed: ${error.message}`);
  }
}

/**
 * Get the Temporal client (must be initialized first)
 */
export function getTemporalClient(): Client {
  if (!client) {
    throw new Error('Temporal client not initialized. Call initializeTemporalClient() first.');
  }
  return client;
}

/**
 * Start a document processing workflow
 */
export async function startDocumentProcessing(input: {
  fileId: string;
  fileName: string;
  format: string;
  minioPath: string;
  instructions?: string;
}) {
  const client = getTemporalClient();

  // Determine if Lambda enrichment is available
  const enrichmentTaskQueue = process.env.LAMBDA_ENRICHMENT_URL
    ? 'lambda-enrichment'
    : 'document-enrichment';

  console.log(`📋 Starting workflow for ${input.fileId}`);
  console.log(`   File: ${input.fileName}`);
  console.log(`   Format: ${input.format}`);
  console.log(`   Enrichment Queue: ${enrichmentTaskQueue}`);

  const handle = await client.workflow.start('documentProcessingWorkflow', {
    args: [
      {
        ...input,
        enrichmentTaskQueue,
      },
    ],
    taskQueue: 'document-processing',
    workflowId: `doc-${input.fileId}`,
    workflowRunTimeout: '1 hour',
    workflowTaskTimeout: '10 minutes',
    retryPolicy: {
      initialInterval: '1s',
      maximumInterval: '1m',
      backoffCoefficient: 2,
      maximumAttempts: 3,
    },
  });

  console.log(`✅ Workflow started: ${handle.workflowId}`);

  return handle;
}

/**
 * Get workflow status
 */
export async function getWorkflowStatus(workflowId: string) {
  const client = getTemporalClient();
  const handle = client.workflow.getHandle(workflowId);

  try {
    // Query current status
    const status = await handle.query('getStatus');
    return status;
  } catch (error: any) {
    console.error(`Error querying workflow ${workflowId}:`, error);
    throw error;
  }
}

/**
 * Get workflow execution history
 */
export async function getWorkflowHistory(workflowId: string) {
  const client = getTemporalClient();
  const handle = client.workflow.getHandle(workflowId);

  try {
    const history = await handle.fetchHistory();
    return history;
  } catch (error: any) {
    console.error(`Error fetching history for ${workflowId}:`, error);
    throw error;
  }
}

/**
 * Get workflow execution result
 */
export async function getWorkflowResult(workflowId: string) {
  const client = getTemporalClient();
  const handle = client.workflow.getHandle(workflowId);

  try {
    const result = await handle.result();
    return result;
  } catch (error: any) {
    console.error(`Error getting result for ${workflowId}:`, error);
    throw error;
  }
}

/**
 * Check task queue stats (for monitoring)
 */
export async function getTaskQueueStats(taskQueue: string) {
  const client = getTemporalClient();

  try {
    const workflowService = client.connection.workflowService;

    // Get task queue info (implementation depends on Temporal SDK version)
    console.log(`📊 Task Queue: ${taskQueue}`);

    return {
      taskQueue,
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error(`Error getting stats for ${taskQueue}:`, error);
    throw error;
  }
}

/**
 * List all active workflows
 */
export async function listActiveWorkflows() {
  const client = getTemporalClient();

  try {
    const workflows = await client.workflow.list();
    return workflows;
  } catch (error: any) {
    console.error('Error listing workflows:', error);
    throw error;
  }
}

export default {
  initializeTemporalClient,
  getTemporalClient,
  startDocumentProcessing,
  getWorkflowStatus,
  getWorkflowHistory,
  getWorkflowResult,
  getTaskQueueStats,
  listActiveWorkflows,
};
