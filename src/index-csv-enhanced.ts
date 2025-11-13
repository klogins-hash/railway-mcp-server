#!/usr/bin/env node
/**
 * Enhanced Railway MCP Server with CSV Upload & Database Integration
 * Includes PostgreSQL persistence and Valkey caching
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express, { Request, Response, NextFunction } from "express";
import multer from "multer";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile, writeFile, readdir, stat, mkdir } from "fs/promises";
import { createReadStream, createWriteStream } from "fs";
import { z } from "zod";
import { createUnzip } from "zlib";
import { pipeline } from "stream/promises";
import { createPostgresService, PostgresService } from "./postgres.js";
import { createValkeyService, ValkeyService } from "./valkey.js";
import { CSVProcessor, CSVProcessingOptions } from "./csv-processor.js";

const execAsync = promisify(exec);

// Environment configuration
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || "change-me-in-production";
const PROJECT_ID = process.env.RAILWAY_PROJECT_ID || "c6955207-08e0-412e-897d-e28d331c0a40";
const ENVIRONMENT_ID = process.env.RAILWAY_ENVIRONMENT_ID || "c5c9eb3b-f9e7-4062-8ee0-38fd8f380200";

// Service instances (lazy loaded)
let postgresService: PostgresService | null = null;
let valkeyService: ValkeyService | null = null;
let csvProcessor: CSVProcessor | null = null;

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

  // Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept all file types - Unstructured.io handles format detection
    cb(null, true);
  },
});

// API Key middleware
const authenticateApiKey = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers["x-api-key"] || req.query.apiKey;

  if (apiKey !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized: Invalid API key" });
  }

  next();
};

// Initialize database services middleware
const initializeDatabaseServices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!postgresService) {
      postgresService = await createPostgresService();
    }
    if (!valkeyService) {
      valkeyService = await createValkeyService();
    }
    if (!csvProcessor && postgresService && valkeyService) {
      csvProcessor = new CSVProcessor(postgresService, valkeyService);
    }
    next();
  } catch (error: any) {
    console.error("Database initialization error:", error);
    res.status(500).json({ error: "Database services unavailable" });
  }
};

// Health check endpoint (no auth required)
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "healthy",
    service: "railway-mcp-server-csv-enhanced",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    features: ["csv-upload", "postgresql", "valkey-cache"],
  });
});

// Service registry endpoint
app.get("/services", authenticateApiKey, async (req: Request, res: Response) => {
  if (serviceRegistry.size === 0) {
    initializeServiceRegistry();
  }
  const services = Array.from(serviceRegistry.values());
  res.json({
    total: services.length,
    services: services,
    timestamp: new Date().toISOString(),
  });
});

// Service health status endpoint
app.get("/services/health", authenticateApiKey, async (req: Request, res: Response) => {
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
app.get("/services/connections", authenticateApiKey, async (req: Request, res: Response) => {
  const connections = Array.from(serviceConnections.values()).flat();
  res.json({
    total: connections.length,
    connected: connections.filter((c) => c.status === "connected").length,
    connections: connections,
    timestamp: new Date().toISOString(),
  });
});

// Configuration export endpoint
app.get("/config/export", authenticateApiKey, async (req: Request, res: Response) => {
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

// CSV Upload endpoint - Unified Unstructured.io approach
app.post(
  "/upload",
  authenticateApiKey,
  initializeDatabaseServices,
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const fileName = req.file.originalname;
      const buffer = req.file.buffer;
      const format = detectFormat(fileName);

      // Check if it's a ZIP file
      if (format === "ZIP") {
        // Extract and process ZIP contents
        const result = await extractAndProcessZip(buffer, fileName, req.body);
        res.json(result);
        return;
      }

      // Call Unstructured.io service for single file
      const elements = await callUnstructured(buffer, fileName);

      if (!elements || elements.length === 0) {
        return res.status(400).json({ error: "No data extracted from file" });
      }

      // Convert elements to rows
      const rows = elementsToRows(elements);

      // Store in PostgreSQL
      const tableName = req.body.tableName || sanitizeTableName(fileName);
      const options: CSVProcessingOptions = {
        tableName,
        batchSize: parseInt(req.body.batchSize || "100", 10),
      };

      // Use CSV processor to handle PostgreSQL insertion
      if (!csvProcessor) {
        return res.status(500).json({ error: "Processor not available" });
      }

      // Process the normalized rows
      const tempFilePath = `/tmp/${Date.now()}-${fileName}`;
      await writeFile(tempFilePath, JSON.stringify(rows));

      const result = await csvProcessor.processCSVFile(tempFilePath, fileName, options);

      res.json({
        success: true,
        jobId: result.jobId,
        tableName: result.tableName,
        rowsProcessed: rows.length,
        format: format,
        message: `✅ Successfully processed ${rows.length} elements from ${fileName}`,
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({
        error: "File processing failed",
        details: error.message,
      });
    }
  }
);

// Helper: Call Unstructured.io to parse any file type
async function callUnstructured(
  buffer: Buffer,
  filename: string
): Promise<any[]> {
  const unstructuredUrl = process.env.UNSTRUCTURED_URL;

  if (!unstructuredUrl) {
    throw new Error("UNSTRUCTURED_URL not configured");
  }

  try {
    const formData = new FormData();
    formData.append("files", new Blob([new Uint8Array(buffer)]), filename);
    formData.append("strategy", "auto"); // Can be: auto, fast, hi_res

    const response = await fetch(
      `${unstructuredUrl}/general/v0/general`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error(
        `Unstructured.io error: ${response.status} ${response.statusText}`
      );
    }

    const result = await response.json();
    return Array.isArray(result) ? result : [];
  } catch (error: any) {
    console.error("Unstructured.io call failed:", error);
    throw new Error(`Failed to parse file: ${error.message}`);
  }
}

// Helper: Convert Unstructured.io elements to database rows
function elementsToRows(elements: any[]): Record<string, any>[] {
  return elements.map((element, idx) => ({
    index: idx,
    type: element.type || "text",
    element_id: element.element_id,
    text: element.text || "",
    metadata_source: element.metadata?.source,
    metadata_page_number: element.metadata?.page_number || null,
    metadata_url: element.metadata?.url || null,
    metadata_raw: JSON.stringify(element.metadata || {}),
  }));
}

// Helper: Detect file format from filename
function detectFormat(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const formatMap: Record<string, string> = {
    pdf: "PDF",
    docx: "Word",
    doc: "Word",
    pptx: "PowerPoint",
    ppt: "PowerPoint",
    xlsx: "Excel",
    xls: "Excel",
    csv: "CSV",
    json: "JSON",
    txt: "Text",
    jpg: "Image",
    jpeg: "Image",
    png: "Image",
    gif: "Image",
    zip: "ZIP",
  };
  return formatMap[ext] || "Unknown";
}

// Helper: Sanitize table name
function sanitizeTableName(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .toLowerCase()
    .substring(0, 63);
}

// Helper: Extract and process ZIP files
async function extractAndProcessZip(buffer: Buffer, zipFileName: string, reqBody: any): Promise<any> {
  try {
    // Create temp directory for extraction
    const extractDir = `/tmp/zip-${Date.now()}`;
    await mkdir(extractDir, { recursive: true });

    // Write ZIP to temp location
    const zipPath = `${extractDir}/${zipFileName}`;
    await writeFile(zipPath, buffer);

    // Extract ZIP using system command
    await execAsync(`unzip -q "${zipPath}" -d "${extractDir}"`);

    // Recursively find all files (excluding directories and __MACOSX)
    const allFiles: string[] = [];
    async function walkDir(dir: string): Promise<void> {
      const files = await readdir(dir);
      for (const file of files) {
        if (file === "__MACOSX" || file.startsWith(".")) continue;
        const fullPath = `${dir}/${file}`;
        const stats = await stat(fullPath);
        if (stats.isDirectory()) {
          await walkDir(fullPath);
        } else {
          allFiles.push(fullPath);
        }
      }
    }

    await walkDir(extractDir);

    // Filter out system files
    const validFiles = allFiles.filter(f => {
      const basename = f.split("/").pop()?.toLowerCase() || "";
      return !basename.startsWith(".") && basename !== "thumbs.db";
    });

    if (validFiles.length === 0) {
      return {
        error: "No valid files found in ZIP",
        details: "ZIP appears to be empty or contains only system files",
      };
    }

    // Process each file through Unstructured.io
    const processedFiles = [];
    const baseTableName = sanitizeTableName(zipFileName.replace(/\.zip$/i, ""));
    let totalRowsProcessed = 0;
    const jobIds: string[] = [];

    for (const filePath of validFiles) {
      try {
        const fileName = filePath.split("/").pop() || "unknown";
        const fileBuffer = await readFile(filePath);
        const format = detectFormat(fileName);

        // Skip certain file types that can't be processed
        if (["zip", "exe", "dll", "so"].includes(format.toLowerCase())) {
          console.log(`Skipping unsupported file: ${fileName}`);
          continue;
        }

        // Process through Unstructured.io
        const elements = await callUnstructured(fileBuffer, fileName);

        if (elements && elements.length > 0) {
          const rows = elementsToRows(elements);

          // Create table name from file name
          const fileSanitized = sanitizeTableName(fileName);
          const tableName = `${baseTableName}_${fileSanitized}`;
          const options: CSVProcessingOptions = {
            tableName,
            batchSize: parseInt(reqBody.batchSize || "100", 10),
          };

          // Process with CSV processor
          if (!csvProcessor) {
            throw new Error("Processor not available");
          }

          const tempFilePath = `/tmp/${Date.now()}-${fileName}`;
          await writeFile(tempFilePath, JSON.stringify(rows));

          const result = await csvProcessor.processCSVFile(tempFilePath, fileName, options);

          processedFiles.push({
            fileName,
            format,
            tableName: result.tableName,
            rowsProcessed: rows.length,
          });

          totalRowsProcessed += rows.length;
          jobIds.push(result.jobId);
        }
      } catch (error: any) {
        console.error(`Error processing file ${filePath}:`, error);
        processedFiles.push({
          fileName: filePath.split("/").pop() || "unknown",
          error: error.message,
        });
      }
    }

    // Clean up temp directory
    await execAsync(`rm -rf "${extractDir}"`);

    return {
      success: true,
      format: "ZIP",
      zipFileName,
      filesProcessed: processedFiles.length,
      totalRowsProcessed,
      files: processedFiles,
      jobIds,
      message: `✅ Successfully processed ${processedFiles.length} files from ZIP (${totalRowsProcessed} rows total)`,
    };
  } catch (error: any) {
    console.error("ZIP extraction/processing error:", error);
    return {
      error: "ZIP processing failed",
      details: error.message,
    };
  }
}

// Get CSV processing job status

app.get(
  "/csv/jobs/:jobId",
  authenticateApiKey,
  initializeDatabaseServices,
  async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const job = await csvProcessor?.getStatus(jobId);

      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      res.json({
        job,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Job status error:", error);
      res.status(500).json({
        error: "Failed to get job status",
        details: error.message,
      });
    }
  }
);

// List all CSV processing jobs
app.get(
  "/csv/jobs",
  authenticateApiKey,
  initializeDatabaseServices,
  async (req: Request, res: Response) => {
    try {
      const jobs = await csvProcessor?.getAllJobs();

      res.json({
        total: jobs?.length || 0,
        jobs: jobs || [],
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Jobs list error:", error);
      res.status(500).json({
        error: "Failed to list jobs",
        details: error.message,
      });
    }
  }
);

// Get table data from PostgreSQL
app.get(
  "/csv/tables/:tableName/data",
  authenticateApiKey,
  initializeDatabaseServices,
  async (req: Request, res: Response) => {
    try {
      const { tableName } = req.params;
      const limit = parseInt(req.query.limit as string || "100", 10);

      const data = await csvProcessor?.queryTableData(tableName, limit);

      res.json({
        tableName,
        rowCount: data?.length || 0,
        data: data || [],
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Table query error:", error);
      res.status(500).json({
        error: "Failed to query table",
        details: error.message,
      });
    }
  }
);

// Get table statistics
app.get(
  "/csv/tables/:tableName/stats",
  authenticateApiKey,
  initializeDatabaseServices,
  async (req: Request, res: Response) => {
    try {
      const { tableName } = req.params;
      const stats = await csvProcessor?.getTableStats(tableName);

      res.json({
        stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Table stats error:", error);
      res.status(500).json({
        error: "Failed to get table statistics",
        details: error.message,
      });
    }
  }
);

// Get cached CSV data
app.get(
  "/csv/cache/:jobId",
  authenticateApiKey,
  initializeDatabaseServices,
  async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const data = await csvProcessor?.getCachedData(jobId);

      res.json({
        jobId,
        rowCount: data?.length || 0,
        data: data || [],
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Cache retrieval error:", error);
      res.status(500).json({
        error: "Failed to retrieve cached data",
        details: error.message,
      });
    }
  }
);

// Clean up job
app.delete(
  "/csv/jobs/:jobId",
  authenticateApiKey,
  initializeDatabaseServices,
  async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      await csvProcessor?.cleanupJob(jobId);

      res.json({
        message: "Job cleaned up successfully",
        jobId,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Job cleanup error:", error);
      res.status(500).json({
        error: "Failed to clean up job",
        details: error.message,
      });
    }
  }
);

// SSE endpoint for MCP connection
app.get("/sse", authenticateApiKey, async (req: Request, res: Response) => {
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
        {
          name: "query_csv_table",
          description: "Query data from a CSV-imported PostgreSQL table",
          inputSchema: {
            type: "object",
            properties: {
              tableName: {
                type: "string",
                description: "Name of the table to query",
              },
              limit: {
                type: "number",
                description: "Maximum number of rows to return (default: 100)",
              },
            },
            required: ["tableName"],
          },
        },
        {
          name: "get_table_stats",
          description: "Get statistics about a CSV-imported table",
          inputSchema: {
            type: "object",
            properties: {
              tableName: {
                type: "string",
                description: "Name of the table",
              },
            },
            required: ["tableName"],
          },
        },
        {
          name: "list_csv_jobs",
          description: "List all CSV processing jobs",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "get_csv_job_status",
          description: "Get status of a specific CSV processing job",
          inputSchema: {
            type: "object",
            properties: {
              jobId: {
                type: "string",
                description: "The job ID",
              },
            },
            required: ["jobId"],
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
              maxBuffer: 1024 * 1024 * 10,
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

        case "query_csv_table": {
          const tableName = (args as any).tableName;
          const limit = (args as any).limit || 100;

          try {
            if (!csvProcessor) throw new Error("CSV processor not initialized");
            const data = await csvProcessor.queryTableData(tableName, limit);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    tableName,
                    rowCount: data.length,
                    data: data,
                  }, null, 2),
                },
              ],
            };
          } catch (error: any) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error querying table: ${error.message}`,
                },
              ],
              isError: true,
            };
          }
        }

        case "get_table_stats": {
          const tableName = (args as any).tableName;

          try {
            if (!csvProcessor) throw new Error("CSV processor not initialized");
            const stats = await csvProcessor.getTableStats(tableName);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(stats, null, 2),
                },
              ],
            };
          } catch (error: any) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error getting table stats: ${error.message}`,
                },
              ],
              isError: true,
            };
          }
        }

        case "list_csv_jobs": {
          try {
            if (!csvProcessor) throw new Error("CSV processor not initialized");
            const jobs = await csvProcessor.getAllJobs();

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    total: jobs.length,
                    jobs: jobs,
                  }, null, 2),
                },
              ],
            };
          } catch (error: any) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error listing jobs: ${error.message}`,
                },
              ],
              isError: true,
            };
          }
        }

        case "get_csv_job_status": {
          const jobId = (args as any).jobId;

          try {
            if (!csvProcessor) throw new Error("CSV processor not initialized");
            const job = await csvProcessor.getStatus(jobId);

            if (!job) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Job ${jobId} not found`,
                  },
                ],
                isError: true,
              };
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(job, null, 2),
                },
              ],
            };
          } catch (error: any) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error getting job status: ${error.message}`,
                },
              ],
              isError: true,
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
app.post("/message", authenticateApiKey, async (req: Request, res: Response) => {
  res.status(200).send();
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Railway MCP Server running on port ${PORT}`);
  console.log(`📊 Features: CSV Upload, PostgreSQL, Valkey Cache`);
  console.log(`🔐 API Key: ${API_KEY}`);
  console.log(`🚀 Connect via: npx @modelcontextprotocol/inspector http://your-railway-url.railway.app/sse?apiKey=${API_KEY}`);
});
