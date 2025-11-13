#!/usr/bin/env node
/**
 * AI Agent Orchestrator for Romantic Growth Project
 *
 * Combines MCP server tools with Groq Llama 3.3 brain for intelligent
 * autonomous operations management and decision-making.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import fetch from "node-fetch";

// Configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY;
if (!GROQ_API_KEY) {
  console.error("❌ Error: GROQ_API_KEY environment variable is required");
  process.exit(1);
}
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "http://localhost:8080";
const MCP_API_KEY = process.env.API_KEY || "change-me-in-production";
const PROJECT_ID = process.env.RAILWAY_PROJECT_ID || "c6955207-08e0-412e-897d-e28d331c0a40";
const ENVIRONMENT_ID = process.env.RAILWAY_ENVIRONMENT_ID || "c5c9eb3b-f9e7-4062-8ee0-38fd8f380200";

interface AgentConfig {
  name: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
}

interface OperationResult {
  success: boolean;
  data?: any;
  error?: string;
  timestamp: string;
}

interface ApiResponse {
  status?: number;
  ok?: boolean;
  json?: () => Promise<any>;
  text?: () => Promise<string>;
}

// Initialize Groq client (using Anthropic SDK compatible format)
const client = new Anthropic({
  apiKey: GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// Agent Configuration
const agentConfig: AgentConfig = {
  name: "RomanticGrowth Agent",
  model: "llama-3.3-70b-versatile",
  temperature: 0.7,
  maxTokens: 4096,
  systemPrompt: `You are an intelligent operations orchestrator for the romantic-growth project on Railway.
Your responsibilities:
1. Monitor service health and automatically respond to issues
2. Manage deployments and configuration synchronization
3. Optimize resource usage and performance
4. Generate insights and recommendations
5. Execute operational tasks autonomously when safe to do so

You have access to MCP tools for managing services. Always explain your reasoning before taking action.
Be conservative with destructive operations - always ask for confirmation or use dry-run first.
When uncertain, gather more information before acting.`,
};

/**
 * Call MCP server tool via HTTP
 */
async function callMCPTool(
  toolName: string,
  toolInput: Record<string, any>
): Promise<OperationResult> {
  try {
    const url = new URL(`${MCP_SERVER_URL}/tools/${toolName}`);

    const response = (await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": MCP_API_KEY,
      },
      body: JSON.stringify(toolInput),
    })) as unknown as ApiResponse;

    if (!response.ok) {
      const errorText = await response.text?.();
      return {
        success: false,
        error: `MCP tool failed with status ${response.status}: ${errorText}`,
        timestamp: new Date().toISOString(),
      };
    }

    const result = await response.json?.();
    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to call MCP tool: ${(error as Error).message}`,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Get available MCP tools
 */
function getMCPTools(): Tool[] {
  return [
    // Service Management Tools
    {
      name: "discover_services",
      description:
        "Discover all services in the romantic-growth project and get their status",
      input_schema: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            enum: ["all", "running", "stopped"],
            description: "Filter services by status",
          },
        },
      },
    },
    {
      name: "get_service_status",
      description: "Get detailed health status of a service",
      input_schema: {
        type: "object",
        properties: {
          serviceName: {
            type: "string",
            description: "Name of the service to check",
          },
        },
        required: ["serviceName"],
      },
    },
    {
      name: "service_health_report",
      description: "Generate comprehensive health report for all services",
      input_schema: {
        type: "object",
        properties: {
          detailed: {
            type: "boolean",
            description: "Include detailed metrics and logs",
          },
        },
      },
    },
    {
      name: "get_metrics",
      description: "Retrieve performance metrics for services",
      input_schema: {
        type: "object",
        properties: {
          serviceName: {
            type: "string",
            description: "Service name (optional, all if not specified)",
          },
          metricType: {
            type: "string",
            enum: ["cpu", "memory", "network", "disk", "all"],
            description: "Type of metrics to retrieve",
          },
        },
      },
    },
    {
      name: "get_logs",
      description: "Get logs from services",
      input_schema: {
        type: "object",
        properties: {
          serviceName: {
            type: "string",
            description: "Service name (optional)",
          },
          lines: {
            type: "number",
            description: "Number of log lines to retrieve",
          },
          level: {
            type: "string",
            enum: ["all", "error", "warn", "info", "debug"],
            description: "Log level filter",
          },
        },
      },
    },

    // Configuration Tools
    {
      name: "get_project_variables",
      description:
        "Get all environment variables and configuration across the project",
      input_schema: {
        type: "object",
        properties: {
          serviceName: {
            type: "string",
            description: "Filter by service (optional)",
          },
        },
      },
    },
    {
      name: "sync_configurations",
      description: "Synchronize configurations across all services",
      input_schema: {
        type: "object",
        properties: {
          configType: {
            type: "string",
            enum: ["environment", "secrets", "all"],
            description: "Type of configuration to sync",
          },
          dryRun: {
            type: "boolean",
            description: "Preview changes without applying",
          },
        },
      },
    },
    {
      name: "validate_configuration",
      description: "Validate configuration across services",
      input_schema: {
        type: "object",
        properties: {
          serviceName: {
            type: "string",
            description: "Service to validate (optional, all if not specified)",
          },
          strict: {
            type: "boolean",
            description: "Enable strict validation mode",
          },
        },
      },
    },

    // Deployment Tools
    {
      name: "trigger_deployment",
      description: "Trigger deployment for a service or the entire project",
      input_schema: {
        type: "object",
        properties: {
          serviceName: {
            type: "string",
            description: "Service to deploy (optional, all if not specified)",
          },
          environment: {
            type: "string",
            enum: ["development", "staging", "production"],
            description: "Target environment",
          },
          dryRun: {
            type: "boolean",
            description: "Preview deployment without applying",
          },
        },
      },
    },

    // File Operations Tools
    {
      name: "read_file",
      description: "Read contents of a file from a service",
      input_schema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file",
          },
        },
        required: ["path"],
      },
    },
    {
      name: "write_file",
      description: "Write content to a file on a service",
      input_schema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file",
          },
          content: {
            type: "string",
            description: "Content to write",
          },
        },
        required: ["path", "content"],
      },
    },
    {
      name: "execute_command",
      description: "Execute a shell command on a service",
      input_schema: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Shell command to execute",
          },
          cwd: {
            type: "string",
            description: "Working directory (optional)",
          },
        },
        required: ["command"],
      },
    },
  ];
}

/**
 * Process tool calls from the AI agent
 */
async function processToolCall(
  toolName: string,
  toolInput: Record<string, any>
): Promise<string> {
  console.log(`\n🔧 Calling tool: ${toolName}`);
  console.log(`   Input: ${JSON.stringify(toolInput, null, 2)}`);

  const result = await callMCPTool(toolName, toolInput);

  console.log(`   Result: ${result.success ? "✅ Success" : "❌ Failed"}`);
  if (result.data) {
    console.log(`   Data: ${JSON.stringify(result.data, null, 2)}`);
  }
  if (result.error) {
    console.log(`   Error: ${result.error}`);
  }

  return JSON.stringify(result);
}

/**
 * Run the AI agent with a given task
 */
async function runAgent(userMessage: string): Promise<string> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🤖 ${agentConfig.name}`);
  console.log(`📋 Task: ${userMessage}`);
  console.log(`${"=".repeat(60)}`);

  const messages: { role: "user" | "assistant"; content: string | { type: string; tool_use_id?: string; content?: string }[] }[] = [
    { role: "user", content: userMessage },
  ];

  let response: any;
  let iterations = 0;
  const maxIterations = 10;

  while (iterations < maxIterations) {
    iterations++;
    console.log(`\n📍 Iteration ${iterations}/${maxIterations}`);

    try {
      response = await client.messages.create({
        model: agentConfig.model,
        max_tokens: agentConfig.maxTokens,
        system: agentConfig.systemPrompt,
        tools: getMCPTools() as Parameters<typeof client.messages.create>[0]['tools'],
        messages: messages as Parameters<typeof client.messages.create>[0]['messages'],
      });

      console.log(`✅ Model response received`);

      // Check if we're done
      if (response.stop_reason === "end_turn") {
        console.log(`\n✨ Agent completed task`);
        break;
      }

      // Process tool calls
      if (response.stop_reason === "tool_use") {
        const toolUseBlocks = response.content.filter(
          (block: { type: string }) => block.type === "tool_use"
        );

        if (toolUseBlocks.length === 0) {
          console.log(`\n✨ Agent completed task`);
          break;
        }

        // Add assistant response to messages
        messages.push({
          role: "assistant",
          content: response.content,
        });

        // Process each tool call
        const toolResults: { type: string; tool_use_id: string; content: string }[] = [];

        for (const toolUse of toolUseBlocks) {
          const toolResult = await processToolCall(
            toolUse.name,
            toolUse.input
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: toolResult,
          });
        }

        // Add tool results to messages
        messages.push({
          role: "user",
          content: toolResults,
        });
      } else {
        console.log(`\n✨ Agent completed task`);
        break;
      }
    } catch (error) {
      console.error(`❌ Error during agent execution: ${(error as Error).message}`);
      break;
    }
  }

  // Extract final response
  if (response && response.content) {
    const textBlocks = response.content.filter(
      (block: { type: string; text?: string }) => block.type === "text"
    );
    if (textBlocks.length > 0) {
      return textBlocks.map((block: { text?: string }) => block.text).join("\n");
    }
  }

  return "Agent execution completed.";
}

/**
 * Interactive agent session
 */
async function startInteractiveSession(): Promise<void> {
  const readline = await import("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(`\n${"=".repeat(60)}`);
  console.log(`🚀 Romantic Growth - AI Agent Orchestrator`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Project: romantic-growth`);
  console.log(`Model: ${agentConfig.model}`);
  console.log(`Available Tools: ${getMCPTools().length}`);
  console.log(`\nType your operational request and press Enter.`);
  console.log(`Type 'exit' to quit.\n`);

  const askQuestion = (): void => {
    rl.question("🎯 Your request: ", async (input) => {
      if (input.toLowerCase() === "exit") {
        console.log("\n👋 Goodbye!");
        rl.close();
        return;
      }

      if (input.trim()) {
        try {
          const result = await runAgent(input);
          console.log(`\n📤 Agent Response:\n${result}`);
        } catch (error) {
          console.error(`\n❌ Error: ${(error as Error).message}`);
        }
      }

      askQuestion();
    });
  };

  askQuestion();
}

/**
 * Run automated operations
 */
async function runAutomatedOperations(): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🤖 Running Automated Operations`);
  console.log(`${"=".repeat(60)}`);

  const operations = [
    "Check the health status of all services in the romantic-growth project and provide a summary.",
    "Get the current metrics for all services and identify any performance concerns.",
    "Validate the project configuration and report any issues.",
    "Generate a comprehensive operational report with recommendations.",
  ];

  for (const operation of operations) {
    console.log(`\n${"─".repeat(60)}`);
    try {
      const result = await runAgent(operation);
      console.log(`\n✅ Result:\n${result}`);
    } catch (error) {
      console.error(`❌ Operation failed: ${(error as Error).message}`);
    }
    console.log();
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const mode = process.argv[2] || "interactive";

  try {
    if (mode === "automated") {
      await runAutomatedOperations();
    } else {
      await startInteractiveSession();
    }
  } catch (error) {
    console.error(`Fatal error: ${(error as Error).message}`);
    process.exit(1);
  }
}

main();
