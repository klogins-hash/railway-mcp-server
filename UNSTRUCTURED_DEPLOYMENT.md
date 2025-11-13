# Deploying Unstructured.io Self-Hosted on Railway

## Overview

Instead of using the Unstructured.io API, we'll deploy the **open-source Unstructured.io** as a self-hosted service on Railway. This gives you:

✅ **No API Costs** - Process unlimited documents
✅ **Full Control** - Your own instance, your data
✅ **No Rate Limits** - Process in parallel
✅ **Privacy** - Data stays on your infrastructure
✅ **Integration Ready** - Connect it to your MCP server

---

## Architecture

```
MCP Server (Node.js)
    └─ File Processor
        ├─ Supported formats (CSV, JSON, XLSX) → Direct
        └─ Complex docs (PDF, Word, Images) → HTTP → Unstructured.io Service
                                                           (Python/FastAPI)
                                                           ↓
                                                      PostgreSQL
```

---

## Step 1: Launch Unstructured.io on Railway

### Option A: Using Docker Image (Recommended)

**Create `Dockerfile.unstructured`:**
```dockerfile
FROM downloads.unstructured.io/unstructured_io/unstructured:latest

# Install additional system dependencies if needed
RUN apt-get update && apt-get install -y \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/*

# Expose API port
EXPOSE 8000

# Run the API server
CMD ["uvicorn", "unstructured.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Option B: Build from Source

```bash
# Clone Unstructured repo
git clone https://github.com/Unstructured-IO/unstructured.git
cd unstructured

# Build Docker image
docker build -t unstructured-service .

# Or use their pre-built image
docker pull downloads.unstructured.io/unstructured_io/unstructured:latest
```

### In Railway Dashboard

1. **Create New Service**
   - Click "New" → "GitHub Repo" or "Docker"
   - OR manually deploy via CLI

2. **Using CLI:**
```bash
cd unstructured-deployment
railway init

# Set up service
railway service add

# Configure
railway config --json
```

3. **Configure Environment**
```bash
PORT=8000
PYTHONUNBUFFERED=1
```

4. **Deploy**
```bash
railway up
```

---

## Step 2: Verify Unstructured.io Service

Once deployed to Railway, test the service:

```bash
# Get Railway URL
UNSTRUCTURED_URL=$(railway domain)

# Test health check
curl http://$UNSTRUCTURED_URL/health

# Test document parsing (PDF example)
curl -X POST \
  -F "files=@document.pdf" \
  http://$UNSTRUCTURED_URL/general/v0/general
```

---

## Step 3: Update MCP Server to Use Unstructured.io

### Update `src/file-processor.ts`

```typescript
export class UnstructuredClient {
  private config: UnstructuredConfig;
  private apiUrl: string;

  constructor(config: UnstructuredConfig) {
    this.config = config;
    // Use Railway URL or local
    this.apiUrl = config.apiUrl || "http://localhost:8000";
  }

  async parseDocument(
    buffer: Buffer,
    filename: string
  ): Promise<FileParsingResult> {
    if (!this.config.enabled) {
      throw new Error("Unstructured.io is not enabled");
    }

    try {
      const formData = new FormData();
      formData.append("files", new Blob([buffer]), filename);

      // Call Unstructured.io API
      const response = await fetch(
        `${this.apiUrl}/general/v0/general`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(`Unstructured.io API error: ${response.statusText}`);
      }

      const result = await response.json();

      // Normalize Unstructured.io response to FileParsingResult
      return this.normalizeResponse(result, filename);
    } catch (error: any) {
      throw new Error(
        `Failed to parse document with Unstructured.io: ${error.message}`
      );
    }
  }

  private normalizeResponse(
    unstructuredResult: any,
    filename: string
  ): FileParsingResult {
    // Convert Unstructured.io output to row format
    const rows: Record<string, any>[] = [];

    if (Array.isArray(unstructuredResult)) {
      // Elements array
      unstructuredResult.forEach((element: any, idx: number) => {
        rows.push({
          index: idx,
          type: element.type || "text",
          text: element.text || "",
          metadata: JSON.stringify(element.metadata || {}),
        });
      });
    }

    return {
      format: "unstructured",
      rows,
      metadata: {
        rowCount: rows.length,
        columnCount: Object.keys(rows[0] || {}).length,
        columns: Object.keys(rows[0] || {}),
        inferredSchema: {
          index: "BIGINT",
          type: "TEXT",
          text: "TEXT",
          metadata: "JSONB",
        },
      },
    };
  }

  isFormatSupported(format: string): boolean {
    const supported = [
      "pdf",
      "docx",
      "doc",
      "pptx",
      "ppt",
      "xlsx",
      "jpg",
      "jpeg",
      "png",
      "gif",
      "bmp",
      "txt",
      "rtf",
    ];
    return supported.includes(format.toLowerCase());
  }
}
```

### Update Upload Endpoint

```typescript
// In index-csv-enhanced.ts

import { FileProcessor } from "./file-processor.js";
import { UnstructuredClient } from "./file-processor.js";

// Initialize clients
const fileProcessor = new FileProcessor();
const unstructuredClient = new UnstructuredClient({
  enabled: process.env.UNSTRUCTURED_ENABLED === "true",
  apiUrl: process.env.UNSTRUCTURED_URL || "http://localhost:8000",
});

// Updated upload endpoint
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
      const format = fileProcessor.detectFormat(fileName);

      let parsingResult: FileParsingResult;

      // Try custom parser first for common formats
      if (fileProcessor.isSupported(format)) {
        parsingResult = await fileProcessor.parseFile(buffer, format);
      }
      // Fall back to Unstructured.io for complex formats
      else if (unstructuredClient.isFormatSupported(format)) {
        parsingResult = await unstructuredClient.parseDocument(buffer, fileName);
      } else {
        return res.status(400).json({
          error: `Unsupported format: ${format}`,
          supportedFormats: fileProcessor.getSupportedFormats(),
        });
      }

      // Normalize rows
      const normalizedRows = fileProcessor.normalizeRows(parsingResult.rows);

      // Process through CSV pipeline
      const options: CSVProcessingOptions = {
        tableName: req.body.tableName,
        batchSize: parseInt(req.body.batchSize || "100", 10),
      };

      const result = await csvProcessor.processCSVFile(
        tempFilePath,
        fileName,
        options
      );

      res.json({
        ...result,
        format: parsingResult.format,
        columns: parsingResult.metadata.columns,
        message: result.success ? "File processed successfully" : "Processing failed",
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
```

---

## Step 4: Environment Configuration

### Add to Railway Environment Variables

```bash
# Unstructured.io Configuration
UNSTRUCTURED_ENABLED=true
UNSTRUCTURED_URL=https://unstructured-production.up.railway.app

# OR for local testing:
# UNSTRUCTURED_URL=http://localhost:8000
```

### Local Testing

```bash
# 1. Start Unstructured locally
docker run -p 8000:8000 \
  downloads.unstructured.io/unstructured_io/unstructured:latest

# 2. In another terminal, set environment
export UNSTRUCTURED_ENABLED=true
export UNSTRUCTURED_URL=http://localhost:8000

# 3. Start your MCP server
npm run csv:dev

#4. Test upload
curl -X POST http://localhost:3000/csv/upload \
  -H "X-API-Key: test-key" \
  -F "file=@document.pdf"
```

---

## Step 5: Railway Deployment Script

Create `railway-deploy.sh`:

```bash
#!/bin/bash

# Deploy Unstructured.io Service
echo "Deploying Unstructured.io..."

# Copy Dockerfile
cp Dockerfile.unstructured unstructured-service/Dockerfile

# Initialize Railway project
cd unstructured-service
railway link

# Configure service
railway service create unstructured
railway config UNSTRUCTURED_ENABLED true

# Deploy
railway up

# Get URL
UNSTRUCTURED_URL=$(railway domain)
echo "✅ Unstructured.io deployed at: $UNSTRUCTURED_URL"

# Go back to main project
cd ..

# Update main service
echo "Configuring MCP server..."
railway config UNSTRUCTURED_URL $UNSTRUCTURED_URL
railway config UNSTRUCTURED_ENABLED true

# Deploy main service
railway up

echo "✅ Deployment complete!"
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Railway Project                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────┐         ┌──────────────────────────┐  │
│  │   MCP Server         │         │  Unstructured.io         │  │
│  │   (Node.js)          │         │  (Python/FastAPI)        │  │
│  │                      │         │                          │  │
│  │ - CSV Support        │────────▶│ - PDF Parsing            │  │
│  │ - JSON Support       │ HTTP    │ - OCR                    │  │
│  │ - XLSX Support       │         │ - Doc extraction         │  │
│  │                      │         │ - Image handling         │  │
│  └──────────────────────┘         └──────────────────────────┘  │
│         │                                     │                   │
│         └─────────────┬───────────────────────┘                  │
│                       │                                            │
│                       ▼                                            │
│           ┌───────────────────────┐                              │
│           │  PostgreSQL Database  │                              │
│           │  Storage              │                              │
│           └───────────────────────┘                              │
│                       │                                            │
│                       ▼                                            │
│           ┌───────────────────────┐                              │
│           │  Valkey Cache         │                              │
│           │  Job Orchestration    │                              │
│           └───────────────────────┘                              │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Resource Requirements

### Unstructured.io Service
- **Memory**: 2-4GB recommended
- **CPU**: 1-2 cores
- **Disk**: 1-2GB
- **Cost**: Included in Railway subscription

### Complete Stack
- **MCP Server**: 512MB-1GB
- **Unstructured.io**: 2-4GB
- **PostgreSQL**: 1-2GB
- **Valkey**: 256-512MB
- **Total**: ~5-10GB (Railway provides up to 100GB Free Tier)

---

## Supported Document Types

With self-hosted Unstructured.io:

✅ **Documents**: PDF, Word (.docx), PowerPoint (.pptx), RTF, TXT
✅ **Spreadsheets**: XLSX, XLSM, CSV (already support natively)
✅ **Images**: JPG, PNG, GIF, BMP (with OCR)
✅ **Other**: Email (.eml)

---

## API Endpoints

### Unstructured.io

**Parse Document:**
```bash
POST /general/v0/general
Content-Type: multipart/form-data

files: <binary>
strategy: auto|fast|hi_res
```

**Response:**
```json
[
  {
    "type": "Title",
    "element_id": "...",
    "text": "Document Title",
    "metadata": {
      "source": "pdf",
      "page_number": 1,
      ...
    }
  },
  ...
]
```

---

## Monitoring & Logging

### Check Unstructured.io Health
```bash
curl https://unstructured-production.up.railway.app/health
```

### View Railway Logs
```bash
railway logs -f
```

### Monitor in MCP Server
```typescript
// Add health check
app.get("/unstructured/health", async (req, res) => {
  try {
    const response = await fetch(
      `${process.env.UNSTRUCTURED_URL}/health`
    );
    const data = await response.json();
    res.json({ status: "ok", unstructured: data });
  } catch (error) {
    res.status(503).json({ status: "error", error: error.message });
  }
});
```

---

## Cost Breakdown

### Self-Hosted (This Approach)
- **API Calls**: $0 (unlimited)
- **Infrastructure**: Railway subscription (~$5-20/month depending on usage)
- **Total**: $5-20/month for all services

### Unstructured.io Cloud API
- **Per Document**: $0.01-0.10
- **Monthly Example**: 1000 docs = $10-100/month
- **No infrastructure cost**

### Hybrid (Custom + Unstructured Self-Hosted)
- **Custom formats**: $0 (CPU time only)
- **Complex formats**: Unstructured.io self-hosted
- **Total**: $5-20/month

---

## Next Steps

1. **Deploy Unstructured.io** to Railway
2. **Update file-processor.ts** with Unstructured client
3. **Configure environment variables**
4. **Test with sample documents** (PDF, Word, Images)
5. **Monitor performance** and adjust resources as needed
6. **Integrate Strands Agent** for autonomous processing

---

## Troubleshooting

### Service Won't Start
```bash
# Check logs
railway logs

# Verify Docker image
docker pull downloads.unstructured.io/unstructured_io/unstructured:latest

# Test locally first
docker run -p 8000:8000 downloads.unstructured.io/unstructured_io/unstructured:latest
```

### Connection Issues
```bash
# Verify URL
echo $UNSTRUCTURED_URL
curl -I $UNSTRUCTURED_URL/health

# Check network
railway logs -f
```

### Memory Issues
- Increase Railway plan
- Process files in smaller batches
- Clear old data from PostgreSQL

### Slow Processing
- Upgrade CPU allocation
- Use `strategy: fast` for Unstructured calls
- Process in parallel with Valkey queue

---

## References

- [Unstructured.io Docs](https://docs.unstructured.io)
- [Unstructured GitHub](https://github.com/Unstructured-IO/unstructured)
- [Railway Docs](https://docs.railway.app)
- [Docker Hub](https://hub.docker.com/r/downloads.unstructured.io/unstructured_io)

---

**Status**: 🚀 Ready to Deploy
**Updated**: November 13, 2025
