# Romantic Growth Project - MCP Integration Implementation Guide

## Overview
This guide provides step-by-step instructions to integrate all elements of the romantic-growth project through a centralized MCP server on Railway.

## Files Created

### 1. Integration Architecture Plan
**File**: `romantic-growth-integration-plan.md`
- Project overview and discovered services
- Three-tier architecture design
- Integration phases and roadmap
- Configuration file specifications
- API documentation

### 2. Enhanced MCP Server Implementation
**File**: `enhanced-romantic-growth-mcp-server.ts`
- Service registry system with TypeScript interfaces
- 15 coordinated tools for service management
- Health monitoring capabilities
- Configuration export endpoints
- Deployment orchestration support

## Current Project Status

✅ **Authenticated**: Logged in as klogins (klogins@thekollektiv.xyz)
✅ **Connected**: Railway SSH access verified
✅ **Services Discovered**:
- railway-mcp-server (Central Hub) - Running on port 8080
- code-server (Development IDE) - code-server-production-b0d0.up.railway.app

## Implementation Steps

### Phase 1: Deploy Enhanced MCP Server

#### Step 1.1: Prepare Local Environment
```bash
# Clone the romantic-growth project locally
git clone <your-repo-url> romantic-growth-local
cd romantic-growth-local

# Install dependencies
npm install

# Copy the enhanced server implementation
cp enhanced-romantic-growth-mcp-server.ts src/index-v2.ts
```

#### Step 1.2: Update package.json
```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "start:enhanced": "node dist/index-v2.js",
    "dev": "tsx src/index.ts",
    "dev:enhanced": "tsx src/index-v2.ts"
  }
}
```

#### Step 1.3: Deploy to Railway
```bash
# Test locally first
npm run dev:enhanced

# Once verified, push to repository
git add src/index-v2.ts
git commit -m "Add enhanced MCP server with service coordination"
git push origin master

# Railway will automatically redeploy
```

### Phase 2: Configure Service Registry

#### Step 2.1: Create Services Registry File (src/services.ts)
```typescript
export interface ServiceDefinition {
  id: string;
  name: string;
  type: 'mcp-server' | 'api' | 'database' | 'code-server' | 'worker';
  port: number;
  healthCheck: string;
  environment: Record<string, string>;
}

export const services: ServiceDefinition[] = [
  {
    id: '381f1bab-f067-4fa0-828f-316aecf63c62',
    name: 'railway-mcp-server',
    type: 'mcp-server',
    port: 8080,
    healthCheck: '/health',
    environment: {
      RAILWAY_PROJECT_ID: 'c6955207-08e0-412e-897d-e28d331c0a40',
      RAILWAY_ENVIRONMENT_ID: 'c5c9eb3b-f9e7-4062-8ee0-38fd8f380200',
    }
  },
  {
    id: 'code-server-production',
    name: 'code-server',
    type: 'code-server',
    port: 443,
    healthCheck: '/health',
    environment: {
      RAILWAY_PROJECT_ID: 'c6955207-08e0-412e-897d-e28d331c0a40',
    }
  },
  // Add other services here as you discover them
];
```

#### Step 2.2: Create Health Check Module (src/health.ts)
```typescript
export async function checkServiceHealth(
  serviceName: string,
  port: number,
  healthEndpoint: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `http://${serviceName}.railway.internal:${port}${healthEndpoint}`,
      { timeout: 5000 }
    );
    return response.ok;
  } catch {
    return false;
  }
}
```

### Phase 3: Wire Up Service Connections

#### Step 3.1: Create Connection Manager (src/connections.ts)
```typescript
interface ServiceConnection {
  from: string;
  to: string;
  type: 'http' | 'internal' | 'database' | 'queue';
  status: 'connected' | 'connecting' | 'disconnected';
}

const connections: ServiceConnection[] = [
  {
    from: 'code-server',
    to: 'railway-mcp-server',
    type: 'http',
    status: 'connected'
  }
];

export function getConnections(serviceName?: string): ServiceConnection[] {
  if (serviceName) {
    return connections.filter(
      c => c.from === serviceName || c.to === serviceName
    );
  }
  return connections;
}
```

#### Step 3.2: Create Configuration Sync (src/config-sync.ts)
```typescript
export async function syncConfigurations() {
  // Automatically sync environment variables across all services
  // 1. Get variables from source service
  // 2. Validate against schema
  // 3. Apply to target services
  // 4. Log changes
}
```

### Phase 4: Add Monitoring & Observability

#### Step 4.1: Create Logging Module (src/logging.ts)
```typescript
import * as fs from 'fs/promises';

export class Logger {
  async log(level: string, service: string, message: string) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] [${service}] ${message}`;
    console.log(logEntry);

    // Store in rotated log files
    await fs.appendFile(
      `/var/log/romantic-growth-${new Date().toISOString().split('T')[0]}.log`,
      logEntry + '\n'
    );
  }
}
```

#### Step 4.2: Create Metrics Collection (src/metrics.ts)
```typescript
export interface Metrics {
  cpu: number;
  memory: number;
  uptime: number;
  requestsPerSecond: number;
  errorRate: number;
}

export function collectMetrics(): Metrics {
  return {
    cpu: process.cpuUsage().user / 1000,
    memory: process.memoryUsage().heapUsed / 1024 / 1024,
    uptime: process.uptime(),
    requestsPerSecond: 0,
    errorRate: 0
  };
}
```

### Phase 5: Create Management Dashboard

#### Step 5.1: Create Dashboard Endpoint (src/dashboard.ts)
```typescript
export function getDashboard() {
  return {
    projectId: process.env.RAILWAY_PROJECT_ID,
    projectName: 'romantic-growth',
    environmentId: process.env.RAILWAY_ENVIRONMENT_ID,
    environmentName: 'production',
    services: getServices(),
    health: getHealthStatus(),
    metrics: collectMetrics(),
    connections: getConnections(),
    lastUpdated: new Date().toISOString()
  };
}
```

#### Step 5.2: Create Dashboard HTML (public/dashboard.html)
```html
<!DOCTYPE html>
<html>
<head>
  <title>Romantic Growth - Service Dashboard</title>
  <style>
    body { font-family: sans-serif; margin: 20px; }
    .service { border: 1px solid #ccc; padding: 10px; margin: 10px 0; }
    .healthy { border-color: green; background: #f0fff0; }
    .unhealthy { border-color: red; background: #fff0f0; }
  </style>
</head>
<body>
  <h1>🚀 Romantic Growth Dashboard</h1>
  <div id="dashboard"></div>
  <script>
    // Load and display dashboard data
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(data => {
        document.getElementById('dashboard').innerHTML =
          JSON.stringify(data, null, 2);
      });
  </script>
</body>
</html>
```

## Testing The Integration

### Test 1: Service Discovery
```bash
railway ssh --project=c6955207-08e0-412e-897d-e28d331c0a40 \
  --environment=c5c9eb3b-f9e7-4062-8ee0-38fd8f380200 \
  --service=381f1bab-f067-4fa0-828f-316aecf63c62 \
  -- curl http://localhost:8080/services?apiKey=YOUR_API_KEY
```

### Test 2: Health Report
```bash
railway ssh --project=c6955207-08e0-412e-897d-e28d331c0a40 \
  --environment=c5c9eb3b-f9e7-4062-8ee0-38fd8f380200 \
  --service=381f1bab-f067-4fa0-828f-316aecf63c62 \
  -- curl http://localhost:8080/services/health?apiKey=YOUR_API_KEY
```

### Test 3: Configuration Export
```bash
railway ssh --project=c6955207-08e0-412e-897d-e28d331c0a40 \
  --environment=c5c9eb3b-f9e7-4062-8ee0-38fd8f380200 \
  --service=381f1bab-f067-4fa0-828f-316aecf63c62 \
  -- curl http://localhost:8080/config/export?apiKey=YOUR_API_KEY
```

## Environment Variables to Set

Set these in your Railway environment:

```
API_KEY=your-secure-api-key-here
RAILWAY_PROJECT_ID=c6955207-08e0-412e-897d-e28d331c0a40
RAILWAY_ENVIRONMENT_ID=c5c9eb3b-f9e7-4062-8ee0-38fd8f380200
LOG_LEVEL=info
METRICS_ENABLED=true
DASHBOARD_ENABLED=true
```

## Tools Available Through MCP

### Service Management
- `discover_services` - Find all services
- `get_service_status` - Check service health
- `service_health_report` - Comprehensive status
- `list_linked_services` - View connections
- `get_project_variables` - List configuration

### Configuration
- `get_project_variables` - View all environment variables
- `sync_configurations` - Synchronize across services
- `validate_configuration` - Check for issues

### Operations
- `execute_command` - Run shell commands
- `get_logs` - Retrieve log entries
- `trigger_deployment` - Deploy services
- `get_metrics` - Performance metrics

### Development
- `read_file` - Read source files
- `write_file` - Edit files
- `list_directory` - Browse filesystem

## Next Steps

1. **Push Enhanced Server**: Deploy enhanced-romantic-growth-mcp-server.ts to Railway
2. **Create Modules**: Implement supporting modules (services.ts, health.ts, etc.)
3. **Add Services**: Register any additional services you discover
4. **Setup Monitoring**: Configure health checks and metrics collection
5. **Build Dashboard**: Create web UI for project visualization
6. **Document APIs**: Generate API documentation for team

## Monitoring & Maintenance

### Daily Checks
```bash
# Check service health
railway ssh ... -- curl http://localhost:8080/services/health

# View recent logs
railway ssh ... -- tail -f service.log

# Monitor metrics
railway ssh ... -- curl http://localhost:8080/api/metrics
```

### Troubleshooting

**Service Not Responding**
1. Check SSH connection: `railway ssh ... -- echo "test"`
2. Verify port is open: `railway ssh ... -- netstat -tlnp`
3. Check logs: `railway ssh ... -- tail service.log`
4. Restart service through dashboard

**Configuration Not Syncing**
1. Run validation: Use `validate_configuration` tool
2. Check environment: `get_project_variables`
3. Verify permissions on target services
4. Manual sync if needed

## Security Considerations

1. **API Key Management**
   - Rotate API keys quarterly
   - Use different keys for different environments
   - Never commit keys to repository

2. **Data Protection**
   - Filter sensitive variables from logs
   - Encrypt configuration in transit
   - Audit all configuration changes

3. **Access Control**
   - Limit SSH access to authorized users
   - Use Railway's built-in access controls
   - Monitor authentication attempts

## Success Metrics

✅ All services discoverable through MCP
✅ Health checks returning accurate status
✅ Configuration synchronized across services
✅ Dashboard showing real-time metrics
✅ Deployment orchestration working
✅ Logs aggregated and searchable
✅ Alerts triggering on failures
✅ Team can manage project without touching code

---

**Last Updated**: November 13, 2025
**Project**: romantic-growth
**Maintainer**: Your Team
