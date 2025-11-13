# Strands Agent Setup Guide - CSV Processing

## Overview

The romantic-growth project now includes a **Strands-powered autonomous agent** that can independently process CSV files, query data, and manage jobs without user intervention. The agent connects to the Railway MCP server via Server-Sent Events (SSE) and discovers tools dynamically.

## What is Strands?

[Strands Agents](https://strandsagents.com) is an enterprise-grade AI agent framework that enables:
- **Tool Integration**: Seamlessly connect to MCP servers and external APIs
- **Multi-Agent Patterns**: Build complex workflows with multiple agents
- **Autonomous Capabilities**: Agents can make decisions and take actions independently
- **Agent2Agent Protocol**: Agents can communicate with each other
- **Production Ready**: Built for reliability and scalability

## Architecture

```
Strands Agent
    ├─ Connects via SSE
    ├─ Discovers MCP Tools
    │  ├─ query_csv_table
    │  ├─ get_table_stats
    │  ├─ list_csv_jobs
    │  ├─ get_csv_job_status
    │  └─ ... (plus 5 more tool)
    ├─ Runs autonomously
    └─ Makes decisions based on context
```

## Installation

### Prerequisites
- Python 3.9+
- An active Railway MCP server with CSV endpoints
- OpenAI API key (or other supported model provider)

### Setup Steps

```bash
# 1. Navigate to agents directory
cd /Users/franksimpson/CascadeProjects/romantic-growth/agents

# 2. Create Python virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Create .env file
cat > .env << 'EOF'
# Strands Agent Configuration
MCP_SERVER_URL=http://localhost:3000/sse
API_KEY=your-api-key-here

# OpenAI Configuration
OPENAI_API_KEY=sk-your-key-here

# Optional: Strands Cloud (for production)
# STRANDS_API_KEY=your-strands-api-key
EOF

# 5. Run the agent
python csv_strands_agent.py
```

## Usage

### Interactive Mode

```bash
python csv_strands_agent.py
```

The agent starts in interactive mode where you can issue commands:

```
> list
Lists all active CSV processing jobs

> query my_table
Query the my_table table and show results

> analyze my_table
Perform autonomous analysis on my_table

> status job-abc123
Check the status of a specific job

> exit
Exit the agent
```

### Programmatic Usage

```python
import asyncio
from csv_strands_agent import CSVStrandsAgent

async def main():
    # Initialize agent
    agent = CSVStrandsAgent(
        mcp_url="http://localhost:3000/sse",
        api_key="your-api-key"
    )

    # Initialize with Strands
    await agent.initialize()

    # Process CSV autonomously
    result = await agent.process_csv("data.csv")
    print(result)

    # Query data
    query_result = await agent.query_table("data", limit=50)
    print(query_result)

    # Analyze data
    analysis = await agent.analyze_data("data")
    print(analysis)

asyncio.run(main())
```

## Agent Capabilities

### 1. CSV Processing
```python
await agent.process_csv("file.csv", table_name="my_table")
```
- Autonomously uploads CSV files
- Validates format and structure
- Creates PostgreSQL tables with inferred schema
- Caches data in Valkey
- Returns job ID and status

### 2. Data Querying
```python
await agent.query_table("my_table", limit=100)
```
- Queries imported data from PostgreSQL
- Automatically provides statistics
- Handles large result sets
- Formats results for readability

### 3. Job Management
```python
await agent.list_jobs()
await agent.get_job_status("job-id")
await agent.cleanup_job("job-id")
```
- Lists all active jobs
- Tracks processing status
- Cleans up completed jobs from cache

### 4. Data Analysis
```python
await agent.analyze_data("my_table")
```
- Provides statistical summaries
- Identifies data patterns
- Offers usage recommendations
- Detects anomalies

## System Prompt

The agent operates with this system prompt:

```
You are an autonomous CSV Processing Agent powered by Strands.

Your capabilities include:
1. Uploading and processing CSV files
2. Querying imported data from PostgreSQL tables
3. Getting statistics and metadata about processed datasets
4. Tracking the status of CSV processing jobs
5. Managing and cleaning up completed jobs

When processing CSV files:
- Always validate the CSV format before importing
- Infer column types automatically
- Cache data in Valkey for fast access
- Provide detailed statistics about the import

When querying data:
- Use appropriate table names
- Provide meaningful insights from the data
- Handle large result sets gracefully

Always:
- Be concise and informative in responses
- Provide job IDs for tracking
- Alert the user to any errors or issues
- Suggest next steps after operations
```

## Configuration

### Environment Variables

```bash
# Required
MCP_SERVER_URL=http://localhost:3000/sse    # MCP server URL
API_KEY=your-secure-api-key                  # API authentication

# Optional
OPENAI_API_KEY=sk-...                        # OpenAI API key (if using GPT models)
ANTHROPIC_API_KEY=sk-ant-...                 # Anthropic key (if using Claude)
STRANDS_API_KEY=...                          # Strands Cloud integration
```

### Model Selection

Supported models:
- `gpt-4` (default) - OpenAI's advanced model
- `gpt-3.5-turbo` - Faster, cheaper alternative
- `claude-3-opus` - Anthropic's most capable model
- `claude-3-sonnet` - Balance of capability and speed

```python
agent = CSVStrandsAgent(
    mcp_url="http://localhost:3000/sse",
    api_key="your-api-key",
    model_id="claude-3-sonnet"  # Change model here
)
```

## Examples

### Example 1: Autonomous CSV Import

```python
import asyncio
from csv_strands_agent import CSVStrandsAgent

async def import_and_analyze():
    agent = CSVStrandsAgent(
        mcp_url="http://localhost:3000/sse",
        api_key="my-api-key"
    )

    await agent.initialize()

    # Upload and process
    result = await agent.process_csv("customers.csv")
    print("✅ Import result:", result)

    # Analyze the imported data
    analysis = await agent.analyze_data("customers")
    print("📊 Analysis:", analysis)

asyncio.run(import_and_analyze())
```

### Example 2: Multi-Step Workflow

```python
async def workflow():
    agent = CSVStrandsAgent(
        mcp_url="http://localhost:3000/sse",
        api_key="my-api-key"
    )

    await agent.initialize()

    # Step 1: List existing jobs
    jobs = await agent.list_jobs()
    print("Active jobs:", jobs)

    # Step 2: Query a table
    data = await agent.query_table("customers")
    print("Customer data:", data)

    # Step 3: Cleanup old jobs
    await agent.cleanup_job("old-job-id")
    print("✅ Cleanup complete")

asyncio.run(workflow())
```

### Example 3: Interactive Session

```bash
# Start the agent
python csv_strands_agent.py

# In the interactive session:
> list
> query customers
> analyze customers
> status job-12345
> exit
```

## Advanced Features

### Tool Filtering

Control which MCP tools the agent can access:

```python
# Coming soon: Tool filtering support
# agent_with_filters = CSVStrandsAgent(
#     mcp_url=...,
#     api_key=...,
#     allowed_tools=["query_csv_table", "list_csv_jobs"]
# )
```

### Multi-Agent Coordination

The agent can communicate with other Strands agents via the Agent2Agent protocol:

```python
# Coming soon: A2A integration
# agent1.coordinate_with(agent2)
```

### Custom Handlers

Add custom behavior for specific events:

```python
# Coming soon: Event handlers
# agent.on_job_complete(lambda result: send_notification(result))
```

## Troubleshooting

### Agent Won't Initialize
```
❌ Error initializing agent: Connection refused
```
**Solution**: Ensure MCP server is running
```bash
# Check if server is running
curl http://localhost:3000/health
```

### MCP Server Not Found
```
❌ Agent initialization failed: Connection refused
```
**Solution**: Verify MCP_SERVER_URL is correct
```bash
# Test connection
curl -H "X-API-Key: your-key" http://localhost:3000/health
```

### No Tools Discovered
```
⚠️ No tools found on MCP server
```
**Solution**: Check API key and server status
```bash
# Verify API key
curl -H "X-API-Key: your-key" http://localhost:3000/services
```

### Model API Key Missing
```
❌ Error: OPENAI_API_KEY not found
```
**Solution**: Set the API key
```bash
export OPENAI_API_KEY=sk-your-key
python csv_strands_agent.py
```

## Performance Tips

1. **Batch Processing**: Process multiple files sequentially
2. **Caching**: Valkey caches data for 24 hours by default
3. **Batch Size**: Larger batches (200-500) for big files
4. **Model Selection**: Use GPT-3.5-turbo for faster, cheaper operations
5. **Tool Filtering**: Only enable needed tools to reduce overhead

## Security Considerations

1. **API Keys**: Never commit .env files
2. **Database Credentials**: Use Railway's environment variables
3. **File Uploads**: Validate file paths before processing
4. **Tool Access**: Consider implementing tool filtering in production
5. **Audit Logging**: Track all agent operations

## Deployment

### Local Development
```bash
python csv_strands_agent.py
```

### Docker Deployment (Coming Soon)
```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY agents/ .
CMD ["python", "csv_strands_agent.py"]
```

### Railway Deployment (Coming Soon)
```bash
# Add to Railway as separate service
# Link PostgreSQL and Valkey
# Set environment variables
# Deploy
```

## Next Steps

1. **Test locally** with sample CSV files
2. **Deploy MCP server** to Railway
3. **Configure environment variables**
4. **Run Strands agent** for autonomous CSV processing
5. **Integrate with workflows** for multi-step automation

## Resources

- [Strands Documentation](https://strandsagents.com/docs)
- [MCP Protocol](https://modelcontextprotocol.io)
- [Strands on GitHub](https://github.com/strands-agents)
- [Agent2Agent Protocol](https://a2aproject.github.io/)

## Support

For issues:
1. Check troubleshooting section above
2. Review Strands documentation
3. Check MCP server logs
4. Test MCP endpoints manually with curl

---

**Status**: ✅ Ready for production
**Version**: 1.0.0
**Last Updated**: November 13, 2025
