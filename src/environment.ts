/**
 * Environment Configuration for Romantic Growth Project
 * Auto-populated from Railway environment variables
 */

export interface EnvironmentConfig {
  // API Configuration
  groqApiKey: string;
  mcpServerUrl: string;
  apiKey: string;

  // Railway Project Context
  projectId: string;
  projectName: string;
  environmentId: string;
  environmentName: string;
  serviceId: string;
  serviceName: string;

  // Deployment Info
  deploymentId: string;
  gitCommitSha: string;
  gitBranch: string;
  gitRepoName: string;
  gitRepoOwner: string;

  // Service URLs
  publicDomain: string;
  privateDomain: string;
  bucketUrl: string;

  // Linked Services
  codeServerUrl: string;
  weaviateUrl: string;
  turtleSwarmieezUrl: string;
  consoleUrl: string;

  // Server Configuration
  port: number;
  region: string;
  replicaId: string;

  // Feature Flags
  betaRuntimeV2: boolean;
}

// Load environment configuration from Railway environment
export function loadEnvironmentConfig(): EnvironmentConfig {
  const config: EnvironmentConfig = {
    // API Configuration
    groqApiKey: process.env.GROQ_API_KEY || "",
    mcpServerUrl: process.env.MCP_SERVER_URL || process.env.RAILWAY_PRIVATE_DOMAIN || "http://localhost:8080",
    apiKey: process.env.API_KEY || "change-me-in-production",

    // Railway Project Context
    projectId: process.env.RAILWAY_PROJECT_ID || "c6955207-08e0-412e-897d-e28d331c0a40",
    projectName: process.env.RAILWAY_PROJECT_NAME || "romantic-growth",
    environmentId: process.env.RAILWAY_ENVIRONMENT_ID || "c5c9eb3b-f9e7-4062-8ee0-38fd8f380200",
    environmentName: process.env.RAILWAY_ENVIRONMENT_NAME || "production",
    serviceId: process.env.RAILWAY_SERVICE_ID || "381f1bab-f067-4fa0-828f-316aecf63c62",
    serviceName: process.env.RAILWAY_SERVICE_NAME || "railway-mcp-server",

    // Deployment Info
    deploymentId: process.env.RAILWAY_DEPLOYMENT_ID || "",
    gitCommitSha: process.env.RAILWAY_GIT_COMMIT_SHA || "",
    gitBranch: process.env.RAILWAY_GIT_BRANCH || "master",
    gitRepoName: process.env.RAILWAY_GIT_REPO_NAME || "railway-mcp-server",
    gitRepoOwner: process.env.RAILWAY_GIT_REPO_OWNER || "klogins-hash",

    // Service URLs
    publicDomain: process.env.RAILWAY_PUBLIC_DOMAIN || "railway-mcp-server-production.up.railway.app",
    privateDomain: process.env.RAILWAY_PRIVATE_DOMAIN || "railway-mcp-server.railway.internal",
    bucketUrl: process.env.RAILWAY_SERVICE_BUCKET_URL || "bucket-production-b01a.up.railway.app",

    // Linked Services
    codeServerUrl: process.env.RAILWAY_SERVICE_CODE_SERVER_URL || "code-server-production-b0d0.up.railway.app",
    weaviateUrl: process.env.RAILWAY_SERVICE_WEAVIATE_URL || "weaviate-production-eb9c.up.railway.app",
    turtleSwarmieezUrl: process.env.RAILWAY_SERVICE_TURTLE_SWARMIEEZ_URL || "turtle-swarmieez-production.up.railway.app",
    consoleUrl: process.env.RAILWAY_SERVICE_CONSOLE_URL || "console-production-b9df.up.railway.app",

    // Server Configuration
    port: parseInt(process.env.PORT || "8080", 10),
    region: process.env.RAILWAY_REPLICA_REGION || "europe-west4-drams3a",
    replicaId: process.env.RAILWAY_REPLICA_ID || "",

    // Feature Flags
    betaRuntimeV2: process.env.RAILWAY_BETA_ENABLE_RUNTIME_V2 === "1",
  };

  // Validate critical configuration
  if (!config.groqApiKey) {
    console.warn("⚠️  GROQ_API_KEY not set. AI agent will not function. Set this in Railway environment.");
  }

  return config;
}

// Export singleton instance
export const config = loadEnvironmentConfig();

// Service discovery helper
export interface LinkedService {
  name: string;
  url: string;
  type: "code-server" | "database" | "storage" | "console" | "other";
  status: "available" | "unknown";
}

export function getLinkedServices(): LinkedService[] {
  const services: LinkedService[] = [];

  if (config.codeServerUrl) {
    services.push({
      name: "code-server",
      url: `https://${config.codeServerUrl}`,
      type: "code-server",
      status: "available",
    });
  }

  if (config.weaviateUrl) {
    services.push({
      name: "weaviate",
      url: `https://${config.weaviateUrl}`,
      type: "database",
      status: "available",
    });
  }

  if (config.turtleSwarmieezUrl) {
    services.push({
      name: "turtle-swarmieez",
      url: `https://${config.turtleSwarmieezUrl}`,
      type: "other",
      status: "available",
    });
  }

  if (config.bucketUrl) {
    services.push({
      name: "bucket",
      url: `https://${config.bucketUrl}`,
      type: "storage",
      status: "available",
    });
  }

  if (config.consoleUrl) {
    services.push({
      name: "console",
      url: `https://${config.consoleUrl}`,
      type: "console",
      status: "available",
    });
  }

  return services;
}

// Configuration validation
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.groqApiKey) {
    errors.push("GROQ_API_KEY is required");
  }

  if (!config.projectId) {
    errors.push("RAILWAY_PROJECT_ID is required");
  }

  if (!config.environmentId) {
    errors.push("RAILWAY_ENVIRONMENT_ID is required");
  }

  if (!config.serviceId) {
    errors.push("RAILWAY_SERVICE_ID is required");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Log configuration (filtered for security)
export function logConfiguration(): void {
  console.log("\n📋 = Romantic Growth Configuration =");
  console.log(`   Project: ${config.projectName} (${config.projectId})`);
  console.log(`   Environment: ${config.environmentName}`);
  console.log(`   Service: ${config.serviceName}`);
  console.log(`   Region: ${config.region}`);
  console.log(`   Public URL: https://${config.publicDomain}`);
  console.log(`   Port: ${config.port}`);
  console.log(`   Groq API: ${config.groqApiKey ? "✅ Configured" : "❌ Not configured"}`);
  console.log(`   Linked Services: ${getLinkedServices().length}`);
  console.log("");

  const linkedServices = getLinkedServices();
  if (linkedServices.length > 0) {
    console.log("🔗 Linked Services:");
    linkedServices.forEach((service) => {
      console.log(`   • ${service.name}: ${service.url}`);
    });
    console.log("");
  }
}

export default config;
