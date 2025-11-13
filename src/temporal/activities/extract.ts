#!/usr/bin/env node
/**
 * Extraction Activity Worker
 * Runs as a containerized worker for document extraction via Unstructured.io
 * Connects to Temporal task queue: document-extraction
 */

import { Connection, Worker } from '@temporalio/worker';
import { extractWithUnstructured } from './index.js';

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
      extractWithUnstructured,
    },

    // Resource allocation for container
    activityFailureHandler: {
      kind: 'ignore',
    },
  });

  console.log('✅ Extraction Worker Started');
  console.log(`   Task Queue: document-extraction`);
  console.log(`   Temporal Server: ${process.env.TEMPORAL_HOST || 'localhost:7233'}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);

  await worker.run();
}

// Error handling
runExtractionWorker().catch(err => {
  console.error('❌ Worker failed:', err);
  process.exit(1);
});
