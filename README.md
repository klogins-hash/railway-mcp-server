# Railway MCP Server

An MCP (Model Context Protocol) server that provides remote access to your Railway service environment.

## Features

- **Execute Commands**: Run shell commands on the Railway service
- **File Operations**: Read, write, and list files
- **Environment Access**: Query environment variables
- **API Key Authentication**: Secure access with API key

## Deployment

### Deploy to Railway

1. Push this code to a GitHub repository
2. Create a new service in Railway
3. Connect your GitHub repository
4. Add environment variable:
   - `API_KEY`: Your secure API key (generate a strong random key)
5. Railway will automatically detect and deploy using the Dockerfile

### Environment Variables

- `PORT`: Port to run the server on (Railway sets this automatically)
- `API_KEY`: API key for authentication (required)

## Usage

### Connect from MCP Inspector

```bash
npx @modelcontextprotocol/inspector https://your-app.railway.app/sse?apiKey=YOUR_API_KEY
```

### Connect from Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "railway": {
      "url": "https://your-app.railway.app/sse?apiKey=YOUR_API_KEY"
    }
  }
}
```

### Connect from Cascade

Add to your Cascade MCP settings:

```json
{
  "railway": {
    "url": "https://your-app.railway.app/sse?apiKey=YOUR_API_KEY"
  }
}
```

## Available Tools

### execute_command
Execute shell commands on the Railway service.

**Parameters:**
- `command` (required): Shell command to execute
- `cwd` (optional): Working directory (default: /root)
- `timeout` (optional): Timeout in milliseconds (default: 30000)

### read_file
Read file contents from the Railway service.

**Parameters:**
- `path` (required): File path to read

### write_file
Write content to a file on the Railway service.

**Parameters:**
- `path` (required): File path to write
- `content` (required): Content to write

### list_directory
List directory contents on the Railway service.

**Parameters:**
- `path` (optional): Directory path (default: current directory)

### get_environment
Get environment variables from the Railway service.

**Parameters:**
- `key` (optional): Specific variable key (returns all if not specified)

## Security

- Always use a strong, randomly generated API key
- The server filters sensitive environment variables (SECRET, PASSWORD, TOKEN)
- Use HTTPS in production (Railway provides this automatically)

## Health Check

```bash
curl https://your-app.railway.app/health
```
