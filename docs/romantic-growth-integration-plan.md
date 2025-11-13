# Romantic Growth Project - Centralized MCP Integration Plan

## Project Overview
**Project**: romantic-growth
**Project ID**: c6955207-08e0-412e-897d-e28d331c0a40
**Environment**: production (c5c9eb3b-f9e7-4062-8ee0-38fd8f380200)
**Status**: 🟢 Active deployment

## Discovered Services

### 1. Railway MCP Server (Central Hub)
- **Service ID**: 381f1bab-f067-4fa0-828f-316aecf63c62
- **Service Name**: railway-mcp-server
- **Status**: Running
- **Type**: Node.js TypeScript MCP Server
- **Port**: 8080
- **URL**: Not publicly exposed (internal)
- **Current Tools**:
  - `execute_command` - Shell command execution
  - `read_file` - File reading
  - `write_file` - File writing
  - `list_directory` - Directory listing
  - `get_environment` - Environment variable access

### 2. Code Server
- **URL**: code-server-production-b0d0.up.railway.app
- **Purpose**: Browser-based IDE for project development
- **Internal Domain**: railway-mcp-server.railway.internal

## Architecture Plan

### Tier 1: Centralized MCP Server (Enhanced)
**Purpose**: Single entry point for all project operations
**Responsibilities**:
- Service discovery and health checks
- Cross-service communication coordination
- Unified logging and monitoring
- Authentication/authorization for all services
- Resource management and allocation

### Tier 2: Service-Specific Adapters
Each service in the project will have:
- Dedicated tools in the MCP server for its operations
- Health monitoring
- Status reporting
- Data synchronization capabilities

### Tier 3: Integration Points
- Database connections (if any)
- Environment variable management
- Deployment orchestration
- Log aggregation

## Integration Tasks

### Phase 1: Service Discovery ✓
- [x] Identify railway-mcp-server as hub
- [x] Identify code-server as development service
- [x] Document environment variables
- [ ] Detect additional services (databases, APIs, etc.)

### Phase 2: Enhanced MCP Server
- [ ] Add service discovery tools
- [ ] Add service health check tools
- [ ] Add cross-service communication
- [ ] Add resource monitoring
- [ ] Add deployment status tracking

### Phase 3: Service Coordination
- [ ] Link all services to centralized MCP
- [ ] Create unified configuration system
- [ ] Implement service-to-service communication
- [ ] Add monitoring and alerting

### Phase 4: Developer Experience
- [ ] Create dashboard/CLI for service management
- [ ] Add automation for common tasks
- [ ] Create documentation for operations
- [ ] Set up logging and debugging tools

## Configuration Files to Create/Modify

### 1. Enhanced MCP Server (src/index.ts)
**New Tools to Add**:
- `discover_services` - List all services in project
- `get_service_status` - Health check for services
- `list_linked_services` - Show service dependencies
- `get_project_variables` - All environment variables
- `service_health_report` - Comprehensive status
- `trigger_deployment` - Deployment management

### 2. Service Registry (src/services.ts)
**Purpose**: Central catalog of all services
```typescript
interface ServiceRegistry {
  services: Service[];
  healthChecks: HealthCheck[];
  dependencies: Dependency[];
}
```

### 3. Integration Config (mcp-config.json)
**Purpose**: Centralized configuration for all integrations

## Current Environment Variables

```
Project: romantic-growth
Environment: production
Region: europe-west4-drams3a
Git Branch: master
Git Commit: d0ff0d21e4d445d88ea321e520e8d4ddccabbc68
Deployment ID: 79b35240-2018-4842-a398-d9b501b964d6
```

## Next Steps

1. **Enhance MCP Server** with service discovery capabilities
2. **Create Service Registry** to catalog all project services
3. **Add Health Monitoring** for all integrated services
4. **Build Coordination Layer** for cross-service operations
5. **Generate Dashboard** for real-time project status
6. **Document Integration** for team and automated systems

## API Documentation

### MCP Server Connection
```
URL: http://railway-mcp-server.railway.internal:8080
SSE Endpoint: /sse?apiKey=<API_KEY>
Message Endpoint: /message
Auth Header: x-api-key
```

### Available Tools (Current)
- execute_command
- read_file
- write_file
- list_directory
- get_environment

### New Tools (To Implement)
- discover_services
- get_service_status
- service_health_report
- list_linked_services
- get_project_variables
- sync_configurations
- trigger_deployment
- get_logs

## Standards & Best Practices

1. **Security**
   - All inter-service communication authenticated
   - API keys rotated regularly
   - Secrets never logged
   - Rate limiting on all endpoints

2. **Reliability**
   - Health checks every 30 seconds
   - Automatic service recovery
   - Audit logs for all operations
   - Graceful degradation

3. **Observability**
   - Structured logging (JSON)
   - Distributed tracing
   - Metrics collection
   - Alert thresholds

4. **DevOps**
   - Infrastructure as Code
   - Automated deployments
   - Blue-green deployments
   - Rollback capabilities
