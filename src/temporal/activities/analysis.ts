#!/usr/bin/env node
/**
 * Analysis Activity Worker
 * Runs as a containerized worker for document analysis via Strands agent
 * Connects to Temporal task queue: document-analysis
 */

import { Connection, Worker } from '@temporalio/worker';
import { analyzeWithAgent } from './index.js';

async function runAnalysisWorker() {
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_HOST || 'localhost:7233',
  });

  const worker = await Worker.create({
    connection,
    namespace: 'default',
    taskQueue: 'document-analysis',

    // Only register analysis activities
    activityImplementations: {
      analyzeWithAgent,
    },

    // Resource allocation for container
    activityFailureHandler: {
      kind: 'ignore',
    },
  });

  console.log('✅ Analysis Worker Started');
  console.log(`   Task Queue: document-analysis`);
  console.log(`   Temporal Server: ${process.env.TEMPORAL_HOST || 'localhost:7233'}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);

  await worker.run();
}

// Error handling
runAnalysisWorker().catch(err => {
  console.error('❌ Worker failed:', err);
  process.exit(1);
});
