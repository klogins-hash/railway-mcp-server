#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile, writeFile, readdir, stat } from "fs/promises";
import { z } from "zod";

const execAsync = promisify(exec);

// Environment configuration
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || "change-me-in-production";
const PROJECT_ID = process.env.RAILWAY_PROJECT_ID || "c6955207-08e0-412e-897d-e28d331c0a40";
const ENVIRONMENT_ID = process.env.RAILWAY_ENVIRONMENT_ID || "c5c9eb3b-f9e7-4062-8ee0-38fd8f380200";

// Service Registry Type Definitions
interface Service {
  id: string;
  name: string;
  type: "mcp-server" | "api" | "database" | "code-server" | "worker" | "other";
  status: "running" | "stopped" | "error" | "unknown";
  port?: number;
  url?: string;
  internalDomain?: string;
  healthCheckEndpoint?: string;
  lastHealthCheck?: Date;
  environment: Record<string, string>;
  metadata?: Record<string, any>;
}

interface HealthStatus {
  serviceId: string;
  serviceName: string;
  healthy: boolean;
  uptime?: number;
  responseTime?: number;
  lastCheck: Date;
  error?: string;
}

interface ServiceConnection {
  from: string;
  to: string;
  type: "http" | "internal" | "database" | "queue";
  status: "connected" | "connecting" | "disconnected";
}

// In-memory service registry
const serviceRegistry: Map<string, Service> = new Map();
const healthStatusMap: Map<string, HealthStatus> = new Map();
const serviceConnections: Map<string, ServiceConnection[]> = new Map();

// Initialize with known services
function initializeServiceRegistry() {
  // Add the MCP server itself
  serviceRegistry.set("railway-mcp-server", {
    id: "381f1bab-f067-4fa0-828f-316aecf63c62",
    name: "railway-mcp-server",
    type: "mcp-server",
    status: "running",
    port: 8080,
    internalDomain: "railway-mcp-server.railway.internal",
    healthCheckEndpoint: "/health",
    environment: {
      RAILWAY_PROJECT_ID: PROJECT_ID,
      RAILWAY_ENVIRONMENT_ID: ENVIRONMENT_ID,
      RAILWAY_SERVICE_NAME: "railway-mcp-server",
      PORT: "8080",
    },
  });

  // Add Code Server
  serviceRegistry.set("code-server", {
    id: "code-server-production",
    name: "code-server",
    type: "code-server",
    status: "running",
    url: "code-server-production-b0d0.up.railway.app",
    port: 443,
    environment: {
      RAILWAY_PROJECT_ID: PROJECT_ID,
      RAILWAY_ENVIRONMENT_ID: ENVIRONMENT_ID,
    },
  });
}

// Create Express app
const app = express();
app.use(express.json());

// API Key middleware
const authenticateApiKey = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const apiKey = req.headers["x-api-key"] || req.query.apiKey;

  if (apiKey !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized: Invalid API key" });
  }

  next();
};

// Health check endpoint (no auth required)
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "railway-mcp-server-enhanced",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Service registry endpoint
app.get("/services", authenticateApiKey, async (req, res) => {
  const services = Array.from(serviceRegistry.values());
  res.json({
    total: services.length,
    services: services,
    timestamp: new Date().toISOString(),
  });
});

// Service health status endpoint
app.get("/services/health", authenticateApiKey, async (req, res) => {
  const healthStatuses = Array.from(healthStatusMap.values());
  res.json({
    total: healthStatuses.length,
    healthy: healthStatuses.filter((h) => h.healthy).length,
    unhealthy: healthStatuses.filter((h) => !h.healthy).length,
    statuses: healthStatuses,
    timestamp: new Date().toISOString(),
  });
});

// Service connections endpoint
app.get("/services/connections", authenticateApiKey, async (req, res) => {
  const connections = Array.from(serviceConnections.values()).flat();
  res.json({
    total: connections.length,
    connected: connections.filter((c) => c.status === "connected").length,
    connections: connections,
    timestamp: new Date().toISOString(),
  });
});

// Configuration export endpoint
app.get("/config/export", authenticateApiKey, async (req, res) => {
  const config = {
    project: {
      id: PROJECT_ID,
      name: "romantic-growth",
      environment: ENVIRONMENT_ID,
    },
    services: Array.from(serviceRegistry.values()),
    connections: Array.from(serviceConnections.values()).flat(),
    health: Array.from(healthStatusMap.values()),
    exportedAt: new Date().toISOString(),
  };
  res.json(config);
});

// SSE endpoint for MCP connection
app.get("/sse", authenticateApiKey, async (req, res) => {
  console.log("New SSE connection established");

  const transport = new SSEServerTransport("/message", res);
  const server = new Server(
    {
      name: "railway-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Define tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "execute_command",
          description: "Execute a shell command on the Railway service",
          inputSchema: {
            type: "object",
            properties: {
              command: {
                type: "string",
                description: "Shell command to execute",
              },
              cwd: {
                type: "string",
                description: "Working directory (optional, defaults to /root)",
              },
              timeout: {
                type: "number",
                description: "Timeout in milliseconds (default: 30000)",
              },
            },
            required: ["command"],
          },
        },
        {
          name: "read_file",
          description: "Read contents of a file from the Railway service",
          inputSchema: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Absolute or relative path to the file",
              },
            },
            required: ["path"],
          },
        },
        {
          name: "write_file",
          description: "Write content to a file on the Railway service",
          inputSchema: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Absolute or relative path to the file",
              },
              content: {
                type: "string",
                description: "Content to write to the file",
              },
            },
            required: ["path", "content"],
          },
        },
        {
          name: "list_directory",
          description: "List contents of a directory on the Railway service",
          inputSchema: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Directory path to list (default: current directory)",
              },
            },
          },
        },
        {
          name: "get_environment",
          description: "Get environment variables from the Railway service",
          inputSchema: {
            type: "object",
            properties: {
              key: {
                type: "string",
                description: "Specific environment variable key (optional, returns all if not specified)",
              },
            },
          },
        },
      ],
    };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "execute_command": {
          const command = (args as any).command;
          const cwd = (args as any).cwd || "/root";
          const timeout = (args as any).timeout || 30000;

          try {
            const { stdout, stderr } = await execAsync(command, {
              cwd,
              timeout,
              maxBuffer: 1024 * 1024 * 10, // 10MB buffer
            });

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    stdout: stdout,
                    stderr: stderr,
                    exit_code: 0,
                  }, null, 2),
                },
              ],
            };
          } catch (error: any) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: false,
                    stdout: error.stdout || "",
                    stderr: error.stderr || error.message,
                    exit_code: error.code || 1,
                  }, null, 2),
                },
              ],
            };
          }
        }

        case "read_file": {
          const path = (args as any).path;
          try {
            const content = await readFile(path, "utf-8");
            return {
              content: [
                {
                  type: "text",
                  text: content,
                },
              ],
            };
          } catch (error: any) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error reading file: ${error.message}`,
                },
              ],
              isError: true,
            };
          }
        }

        case "write_file": {
          const path = (args as any).path;
          const content = (args as any).content;
          try {
            await writeFile(path, content, "utf-8");
            return {
              content: [
                {
                  type: "text",
                  text: `Successfully wrote to ${path}`,
                },
              ],
            };
          } catch (error: any) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error writing file: ${error.message}`,
                },
              ],
              isError: true,
            };
          }
        }

        case "list_directory": {
          const path = (args as any).path || ".";
          try {
            const files = await readdir(path);
            const fileStats = await Promise.all(
              files.map(async (file) => {
                const filePath = `${path}/${file}`;
                const stats = await stat(filePath);
                return {
                  name: file,
                  type: stats.isDirectory() ? "directory" : "file",
                  size: stats.size,
                  modified: stats.mtime,
                };
              })
            );

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(fileStats, null, 2),
                },
              ],
            };
          } catch (error: any) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error listing directory: ${error.message}`,
                },
              ],
              isError: true,
            };
          }
        }

        case "get_environment": {
          const key = (args as any).key;
          if (key) {
            const value = process.env[key];
            return {
              content: [
                {
                  type: "text",
                  text: value ? `${key}=${value}` : `${key} not found`,
                },
              ],
            };
          } else {
            // Return all environment variables (filtered for security)
            const safeEnv = Object.entries(process.env)
              .filter(([k]) => !k.includes("SECRET") && !k.includes("PASSWORD") && !k.includes("TOKEN"))
              .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(safeEnv, null, 2),
                },
              ],
            };
          }
        }

        default:
          return {
            content: [
              {
                type: "text",
                text: `Unknown tool: ${name}`,
              },
            ],
            isError: true,
          };
      }
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  });

  await server.connect(transport);

  req.on("close", () => {
    console.log("SSE connection closed");
  });
});

// Message endpoint for MCP
app.post("/message", authenticateApiKey, async (req, res) => {
  // This endpoint is used by the SSE transport
  res.status(200).send();
});

// Start server
app.listen(PORT, () => {
  console.log(`Railway MCP Server running on port ${PORT}`);
  console.log(`API Key: ${API_KEY}`);
  console.log(`Connect via: npx @modelcontextprotocol/inspector http://your-railway-url.railway.app/sse?apiKey=${API_KEY}`);
});
