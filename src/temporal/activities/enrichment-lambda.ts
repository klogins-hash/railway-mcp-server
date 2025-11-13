#!/usr/bin/env node
/**
 * Enrichment Activity - AWS Lambda Handler
 * Runs as a serverless Lambda function for on-demand E2B sandbox execution
 * Triggered from Temporal enrichment activity or API Gateway
 */

import { APIGatewayProxyHandler, SQSEvent } from 'aws-lambda';
import { enrichWithE2B } from './index.js';

// Lambda handler for API Gateway or direct invocation
export const handler: APIGatewayProxyHandler = async (event) => {
  console.log('📨 Enrichment Lambda invoked');
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    let input: { fileId: string; agentDecisions: any[] };

    // Parse input from different trigger types
    if (event.body) {
      // From API Gateway or direct HTTP invocation
      input = JSON.parse(event.body);
    } else if (event.Records) {
      // From SQS trigger
      const message = event.Records[0].body;
      input = JSON.parse(message);
    } else {
      // Direct lambda invocation with event parameters
      input = event as any;
    }

    const { fileId, agentDecisions } = input;

    if (!fileId || !agentDecisions) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Missing required fields: fileId, agentDecisions',
        }),
      };
    }

    console.log(`🔄 Processing enrichment for ${fileId}`);

    // Execute enrichment activity
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
        error: 'Enrichment failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      }),
    };
  }
};

// SQS batch handler (optional)
export const sqsHandler = async (event: SQSEvent) => {
  console.log(`📨 Processing ${event.Records.length} SQS messages`);

  const results = await Promise.all(
    event.Records.map(async (record) => {
      try {
        const input = JSON.parse(record.body);
        const { fileId, agentDecisions } = input;

        console.log(`🔄 Processing enrichment for ${fileId}`);

        const result = await enrichWithE2B({
          fileId,
          agentDecisions,
        });

        return {
          messageId: record.messageId,
          success: true,
          fileId,
          result,
        };
      } catch (error: any) {
        console.error(`❌ Error processing message ${record.messageId}:`, error);
        return {
          messageId: record.messageId,
          success: false,
          error: error.message,
        };
      }
    })
  );

  console.log(`✅ Batch processing complete:`, results);
  return results;
};
