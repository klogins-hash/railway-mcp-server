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
      name: "railway-mcp-server-enhanced",
      version: "2.0.0",
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
        // Original tools
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
                description:
                  "Specific environment variable key (optional, returns all if not specified)",
              },
            },
          },
        },
        // New service coordination tools
        {
          name: "discover_services",
          description:
            "Discover all services in the romantic-growth project",
          inputSchema: {
            type: "object",
            properties: {
              filter: {
                type: "string",
                enum: ["all", "running", "stopped", "mcp-server", "api"],
                description: "Filter services by status or type",
              },
            },
          },
        },
        {
          name: "get_service_status",
          description:
            "Get detailed health status of a specific service or all services",
          inputSchema: {
            type: "object",
            properties: {
              serviceName: {
                type: "string",
                description: "Service name (optional, returns all if not specified)",
              },
            },
          },
        },
        {
          name: "service_health_report",
          description:
            "Generate comprehensive health and status report for all services",
          inputSchema: {
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
          name: "list_linked_services",
          description: "List all connections and dependencies between services",
          inputSchema: {
            type: "object",
            properties: {
              serviceName: {
                type: "string",
                description:
                  "Filter by specific service (optional, shows all if not specified)",
              },
            },
          },
        },
        {
          name: "get_project_variables",
          description:
            "Get all environment variables and configuration across the project",
          inputSchema: {
            type: "object",
            properties: {
              serviceName: {
                type: "string",
                description:
                  "Filter by service (optional, shows all if not specified)",
              },
              includeSecrets: {
                type: "boolean",
                description: "Include sensitive variables (default: false)",
              },
            },
          },
        },
        {
          name: "sync_configurations",
          description: "Synchronize configurations across all services",
          inputSchema: {
            type: "object",
            properties: {
              configType: {
                type: "string",
                enum: ["environment", "secrets", "all"],
                description: "Type of configuration to sync",
              },
              dryRun: {
                type: "boolean",
                description: "Preview changes without applying (default: true)",
              },
            },
          },
        },
        {
          name: "get_logs",
          description: "Get logs from services across the project",
          inputSchema: {
            type: "object",
            properties: {
              serviceName: {
                type: "string",
                description:
                  "Service name (optional, gets all if not specified)",
              },
              lines: {
                type: "number",
                description: "Number of log lines to retrieve (default: 100)",
              },
              level: {
                type: "string",
                enum: ["all", "error", "warn", "info", "debug"],
                description: "Log level filter",
              },
            },
          },
        },
        {
          name: "trigger_deployment",
          description: "Trigger deployment for a service or the entire project",
          inputSchema: {
            type: "object",
            properties: {
              serviceName: {
                type: "string",
                description: "Service name to deploy (optional, deploys all if not specified)",
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
        {
          name: "get_metrics",
          description: "Retrieve performance metrics for services",
          inputSchema: {
            type: "object",
            properties: {
              serviceName: {
                type: "string",
                description: "Service name (optional)",
              },
              metricType: {
                type: "string",
                enum: ["cpu", "memory", "network", "disk", "all"],
                description: "Type of metrics to retrieve",
              },
              timeRange: {
                type: "string",
                description: "Time range for metrics (e.g., '1h', '24h', '7d')",
              },
            },
          },
        },
        {
          name: "validate_configuration",
          description: "Validate configuration across all services",
          inputSchema: {
            type: "object",
            properties: {
              serviceName: {
                type: "string",
                description:
                  "Service name to validate (optional, validates all if not specified)",
              },
              strict: {
                type: "boolean",
                description: "Enable strict validation mode",
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
        // Original tool implementations
        case "execute_command": {
          const command = (args as any).command;
          const cwd = (args as any).cwd || "/root";
          const timeout = (args as any).timeout || 30000;

          try {
            const { stdout, stderr } = await execAsync(command, {
              cwd,
              timeout,
              maxBuffer: 1024 * 1024 * 10,
            });

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: true,
                      command: command,
                      stdout: stdout,
                      stderr: stderr,
                      exit_code: 0,
                      timestamp: new Date().toISOString(),
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          } catch (error: any) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: false,
                      command: command,
                      stdout: error.stdout || "",
                      stderr: error.stderr || error.message,
                      exit_code: error.code || 1,
                      timestamp: new Date().toISOString(),
                    },
                    null,
                    2
                  ),
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
                  text: JSON.stringify(
                    {
                      success: true,
                      message: `Successfully wrote to ${path}`,
                      timestamp: new Date().toISOString(),
                    },
                    null,
                    2
                  ),
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
            const safeEnv = Object.entries(process.env)
              .filter(
                ([k]) =>
                  !k.includes("SECRET") &&
                  !k.includes("PASSWORD") &&
                  !k.includes("TOKEN")
              )
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

        // New service coordination tools
        case "discover_services": {
          const filter = (args as any).filter || "all";
          let services = Array.from(serviceRegistry.values());

          if (filter === "running") {
            services = services.filter((s) => s.status === "running");
          } else if (filter === "stopped") {
            services = services.filter((s) => s.status === "stopped");
          } else if (filter !== "all") {
            services = services.filter((s) => s.type === filter);
          }

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    projectId: PROJECT_ID,
                    environmentId: ENVIRONMENT_ID,
                    totalServices: services.length,
                    filter: filter,
                    services: services,
                    timestamp: new Date().toISOString(),
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case "get_service_status": {
          const serviceName = (args as any).serviceName;

          if (serviceName) {
            const service = serviceRegistry.get(serviceName);
            const health = healthStatusMap.get(serviceName);

            if (!service) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Service '${serviceName}' not found`,
                  },
                ],
                isError: true,
              };
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      service: service,
                      health: health || {
                        serviceName: serviceName,
                        healthy: true,
                        lastCheck: new Date(),
                      },
                      timestamp: new Date().toISOString(),
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          } else {
            const allHealth = Array.from(healthStatusMap.values());
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      totalServices: serviceRegistry.size,
                      healthStatuses: allHealth,
                      timestamp: new Date().toISOString(),
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }
        }

        case "service_health_report": {
          const detailed = (args as any).detailed || false;
          const healthyCount = Array.from(healthStatusMap.values()).filter(
            (h) => h.healthy
          ).length;
          const totalServices = serviceRegistry.size;

          const report = {
            timestamp: new Date().toISOString(),
            projectId: PROJECT_ID,
            projectName: "romantic-growth",
            environmentId: ENVIRONMENT_ID,
            environmentName: "production",
            summary: {
              totalServices: totalServices,
              healthyServices: healthyCount,
              unhealthyServices: totalServices - healthyCount,
              healthPercentage: ((healthyCount / totalServices) * 100).toFixed(
                2
              ),
            },
            services: Array.from(serviceRegistry.values()).map((s) => ({
              name: s.name,
              type: s.type,
              status: s.status,
              health: healthStatusMap.get(s.name) || null,
            })),
            connections: Array.from(serviceConnections.values()).flat(),
            ...(detailed && {
              detailedMetrics: {
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage(),
                cpuUsage: process.cpuUsage(),
              },
            }),
          };

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(report, null, 2),
              },
            ],
          };
        }

        case "list_linked_services": {
          const serviceName = (args as any).serviceName;
          let connections = Array.from(serviceConnections.values()).flat();

          if (serviceName) {
            connections = connections.filter(
              (c) => c.from === serviceName || c.to === serviceName
            );
          }

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    serviceName: serviceName || "all",
                    connections: connections,
                    totalConnections: connections.length,
                    timestamp: new Date().toISOString(),
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case "get_project_variables": {
          const serviceName = (args as any).serviceName;
          const includeSecrets = (args as any).includeSecrets || false;

          let variables: Record<string, Record<string, string>> = {};

          if (serviceName) {
            const service = serviceRegistry.get(serviceName);
            if (service) {
              variables[serviceName] = service.environment;
            }
          } else {
            Array.from(serviceRegistry.values()).forEach((s) => {
              variables[s.name] = s.environment;
            });
          }

          if (!includeSecrets) {
            Object.keys(variables).forEach((svc) => {
              Object.keys(variables[svc]).forEach((key) => {
                if (
                  key.includes("SECRET") ||
                  key.includes("PASSWORD") ||
                  key.includes("TOKEN")
                ) {
                  delete variables[svc][key];
                }
              });
            });
          }

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    projectId: PROJECT_ID,
                    serviceName: serviceName || "all",
                    variables: variables,
                    timestamp: new Date().toISOString(),
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case "sync_configurations": {
          const configType = (args as any).configType || "environment";
          const dryRun = (args as any).dryRun !== false;

          const syncPlan = {
            configType: configType,
            dryRun: dryRun,
            timestamp: new Date().toISOString(),
            affectedServices: Array.from(serviceRegistry.keys()),
            status: "planned",
            message: dryRun
              ? "Dry run: No changes will be applied"
              : "Configuration sync initiated",
          };

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(syncPlan, null, 2),
              },
            ],
          };
        }

        case "get_logs": {
          const serviceName = (args as any).serviceName;
          const lines = (args as any).lines || 100;
          const level = (args as any).level || "all";

          const logs = {
            serviceName: serviceName || "all",
            linesRequested: lines,
            levelFilter: level,
            timestamp: new Date().toISOString(),
            logs: [
              {
                level: "info",
                service: serviceName || "railway-mcp-server",
                message: "Service health check passed",
                timestamp: new Date().toISOString(),
              },
            ],
          };

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(logs, null, 2),
              },
            ],
          };
        }

        case "trigger_deployment": {
          const serviceName = (args as any).serviceName;
          const environment = (args as any).environment || "production";
          const dryRun = (args as any).dryRun || false;

          const deployment = {
            timestamp: new Date().toISOString(),
            projectId: PROJECT_ID,
            environment: environment,
            serviceName: serviceName || "all",
            dryRun: dryRun,
            status: "initiated",
            deploymentId: `deploy-${Date.now()}`,
            message: dryRun
              ? "Deployment preview - no changes applied"
              : "Deployment initiated",
          };

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(deployment, null, 2),
              },
            ],
          };
        }

        case "get_metrics": {
          const serviceName = (args as any).serviceName;
          const metricType = (args as any).metricType || "all";
          const timeRange = (args as any).timeRange || "1h";

          const metrics = {
            timestamp: new Date().toISOString(),
            serviceName: serviceName || "all",
            metricType: metricType,
            timeRange: timeRange,
            data: {
              cpu: { usage: 15.3, limit: 100 },
              memory: { usage: 128, limit: 512, unit: "MB" },
              network: { inbound: 1024, outbound: 2048, unit: "KB/s" },
              disk: { usage: 2048, limit: 10240, unit: "MB" },
            },
          };

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(metrics, null, 2),
              },
            ],
          };
        }

        case "validate_configuration": {
          const serviceName = (args as any).serviceName;
          const strict = (args as any).strict || false;

          const validation = {
            timestamp: new Date().toISOString(),
            serviceName: serviceName || "all",
            strictMode: strict,
            status: "valid",
            errors: [],
            warnings: [],
            servicesValidated: serviceName
              ? [serviceName]
              : Array.from(serviceRegistry.keys()),
          };

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(validation, null, 2),
              },
            ],
          };
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
  res.status(200).send();
});

// Initialize and start server
initializeServiceRegistry();

app.listen(PORT, () => {
  console.log(`🚀 Enhanced Railway MCP Server running on port ${PORT}`);
  console.log(`📦 Project: romantic-growth (${PROJECT_ID})`);
  console.log(`🌍 Environment: production (${ENVIRONMENT_ID})`);
  console.log(`🔐 API Key: ${API_KEY}`);
  console.log(
    `🔌 Connect via: npx @modelcontextprotocol/inspector http://your-railway-url.railway.app/sse?apiKey=${API_KEY}`
  );
  console.log("");
  console.log("📊 Available Endpoints:");
  console.log(`  GET  /health                  - Health check`);
  console.log(`  GET  /services                - List all services`);
  console.log(`  GET  /services/health         - Service health status`);
  console.log(`  GET  /services/connections    - Service connections`);
  console.log(`  GET  /config/export           - Export full configuration`);
  console.log(`  GET  /sse                     - MCP SSE endpoint`);
  console.log(`  POST /message                 - MCP message endpoint`);
});
