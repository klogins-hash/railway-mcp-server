# Simplified Approach: Use Unstructured.io for Everything

## The Better Strategy

You're right! **If we're deploying Unstructured.io anyway, use it for everything.** This gives us:

✅ **One Single Source of Truth** - All files go through Unstructured.io
✅ **Simpler Code** - No branching logic, no custom parsers
✅ **Consistent Output** - Same structured format for all file types
✅ **Better Performance** - Optimized C++ binaries in the container
✅ **Future Proof** - Unstructured.io gets better, we get better
✅ **Fewer Dependencies** - No need for csv-parser, xlsx, arrow libraries

---

## Unified Architecture

```
Client Uploads File (ANY TYPE)
    ↓
Express Server (/upload endpoint)
    ↓
Multer (File handling - 50MB limit)
    ↓
HTTP Call to Unstructured.io Service
    │
    ├─ PDF → Extract text, tables, images
    ├─ Word → Extract sections, paragraphs
    ├─ PowerPoint → Extract slides
    ├─ XLSX → Extract as structured rows
    ├─ CSV → Parse rows
    ├─ JSON → Parse objects
    ├─ Images → OCR → Text + detected objects
    └─ Any other format → Best effort extraction
    ↓
Normalize to Row Format (Elements → Rows)
    ↓
PostgreSQL + Valkey Cache
    ↓
Query/Analyze Results
```

---

## Implementation: Simplified Approach

### Remove This
- ❌ Custom CSV parser
- ❌ Custom JSON parser
- ❌ Custom XLSX parser
- ❌ Custom Parquet parser
- ❌ File detection logic
- ❌ 500+ lines of parsing code

### Keep This
- ✅ Express server
- ✅ PostgreSQL integration
- ✅ Valkey caching
- ✅ Strands Agent
- ✅ MCP endpoints

---

## New Upload Endpoint

```typescript
// src/index-csv-enhanced.ts

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

      // Call Unstructured.io - handles ALL file types
      const elements = await callUnstructured(buffer, fileName);

      // Convert elements to rows
      const rows = elementsToRows(elements);

      if (rows.length === 0) {
        return res.status(400).json({ error: "No data found in file" });
      }

      // Store in PostgreSQL
      const tableName = req.body.tableName || sanitizeTableName(fileName);
      const result = await csvProcessor.processData(rows, tableName);

      res.json({
        success: true,
        jobId: result.jobId,
        tableName: result.tableName,
        rowsProcessed: rows.length,
        format: detectFormat(fileName),
        message: `✅ Processed ${rows.length} rows from ${fileName}`,
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({
        error: "Processing failed",
        details: error.message,
      });
    }
  }
);

// Helper: Call Unstructured.io
async function callUnstructured(
  buffer: Buffer,
  filename: string
): Promise<any[]> {
  const formData = new FormData();
  formData.append("files", new Blob([buffer]), filename);
  formData.append("strategy", "auto"); // or "fast", "hi_res"

  const response = await fetch(
    `${process.env.UNSTRUCTURED_URL}/general/v0/general`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!response.ok) {
    throw new Error(`Unstructured.io failed: ${response.statusText}`);
  }

  return response.json();
}

// Helper: Convert Unstructured elements to database rows
function elementsToRows(elements: any[]): Record<string, any>[] {
  return elements.map((element, idx) => ({
    index: idx,
    type: element.type || "text", // "Title", "NarrativeText", "Table", etc
    element_id: element.element_id,
    text: element.text || "",
    metadata_source: element.metadata?.source,
    metadata_page_number: element.metadata?.page_number,
    metadata_url: element.metadata?.url,
    metadata_raw: JSON.stringify(element.metadata || {}),
  }));
}

// Helper: Detect file type from extension
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
  };
  return formatMap[ext] || "Unknown";
}

// Helper: Sanitize table names
function sanitizeTableName(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .toLowerCase()
    .substring(0, 63);
}
```

---

## Advantages of This Approach

### Simplicity
- **300 lines of code → 50 lines**
- Single responsibility: orchestrate the flow
- Unstructured.io handles complexity

### Reliability
- Unstructured.io is battle-tested for 20+ formats
- Better error handling for edge cases
- Consistent API across all file types

### Maintainability
- No library updates to manage
- No version conflicts
- One code path to debug

### Performance
- Unstructured.io is optimized in C++
- Parallel processing support
- Memory efficient

### Cost
- Same infrastructure cost as before
- Zero additional fees
- Unlimited document processing

---

## Deployment

### 1. Deploy Unstructured.io to Railway
```bash
# See UNSTRUCTURED_DEPLOYMENT.md for full details

# Quick version:
docker pull downloads.unstructured.io/unstructured_io/unstructured:latest

# Deploy to Railway
cd unstructured-service
railway service create unstructured
railway config PORT=8000
railway up

# Get URL
UNSTRUCTURED_URL=$(railway domain)
echo $UNSTRUCTURED_URL
```

### 2. Update MCP Server Environment
```bash
# In Railway environment variables:
UNSTRUCTURED_ENABLED=true
UNSTRUCTURED_URL=https://unstructured-production.up.railway.app
```

### 3. Simplify package.json
```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.68.0",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "express": "^4.18.2",
    "multer": "^1.4.4",
    "node-fetch": "^3.3.2",
    "pg": "^8.11.3",
    "redis": "^4.6.13",
    "zod": "^3.22.4"
  }
}
```

**Remove these dependencies (no longer needed)**:
- ❌ csv-parser
- ❌ csv-parse
- ❌ xlsx
- ❌ apache-arrow
- ❌ papaparse

---

## Supported File Types

Unstructured.io handles:

✅ **Documents**: PDF, DOCX, DOC, PPTX, PPT, RTF, TXT, HTML, XML
✅ **Data**: XLSX, XLS, CSV, JSON, JSONL, PARQUET, ORC
✅ **Images**: JPG, JPEG, PNG, GIF, BMP, TIFF, SVG
✅ **Email**: MSG, EML
✅ **Archives**: ZIP (extracts and processes contents)

All with:
- 🔍 OCR for images
- 📊 Table extraction
- 🏷️ Element categorization (Title, Text, Table, etc.)
- 📍 Metadata extraction (page numbers, coordinates, etc.)

---

## Database Schema

Simple table structure for all files:

```sql
CREATE TABLE IF NOT EXISTS file_elements (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  job_id VARCHAR(100),
  filename VARCHAR(255),
  file_format VARCHAR(50),
  index BIGINT,
  type VARCHAR(50),  -- "Title", "NarrativeText", "Table", "Image", etc
  element_id VARCHAR(255),
  text TEXT,
  metadata_source VARCHAR(50),
  metadata_page_number INT,
  metadata_url TEXT,
  metadata_raw JSONB
);
```

---

## Example Responses

### Upload PDF
```json
{
  "success": true,
  "jobId": "job-123...",
  "tableName": "document_pdf",
  "rowsProcessed": 42,
  "format": "PDF",
  "message": "✅ Processed 42 rows from document.pdf"
}
```

### Query Results
```json
{
  "tableName": "document_pdf",
  "rowCount": 42,
  "data": [
    {
      "index": 0,
      "type": "Title",
      "text": "My Document",
      "metadata_page_number": 1
    },
    {
      "index": 1,
      "type": "NarrativeText",
      "text": "This is paragraph...",
      "metadata_page_number": 1
    }
  ]
}
```

---

## MCP Tools Remain the Same

All existing MCP tools work identically:
- `query_csv_table` → Query processed files
- `get_table_stats` → Get statistics
- `list_csv_jobs` → List jobs
- `get_csv_job_status` → Check status

Just simpler code path behind the scenes.

---

## What We Remove

**Delete these files:**
- ❌ `src/file-processor.ts` (replaced by Unstructured.io call)

**Simplify these files:**
- ✅ `src/index-csv-enhanced.ts` - Remove branching logic
- ✅ `src/csv-processor.ts` - Remove type inference (use Unstructured output)

**Keep these files:**
- ✅ `src/postgres.ts`
- ✅ `src/valkey.ts`
- ✅ `UNSTRUCTURED_DEPLOYMENT.md`

---

## What We Gain

✅ **Fewer dependencies** - Smaller Docker image
✅ **Simpler code** - Easier to maintain
✅ **No parsing bugs** - Unstructured handles edge cases
✅ **Consistency** - All files processed same way
✅ **Better performance** - No library overhead
✅ **Future proof** - Unstructured improvements help us

---

## Migration Path (If Needed)

If wanting cloud API instead of self-hosted later:

```typescript
// Just change the URL
const UNSTRUCTURED_URL = process.env.UNSTRUCTURED_URL;
// Point to: https://api.unstructured.io/general/v0/general
// With API key in headers
```

Same code, just different endpoint!

---

## Deployment Checklist

- [ ] Deploy Unstructured.io to Railway (copy from UNSTRUCTURED_DEPLOYMENT.md)
- [ ] Simplify index-csv-enhanced.ts (remove file-processor usage)
- [ ] Update package.json (remove csv-parser, xlsx, arrow)
- [ ] Set UNSTRUCTURED_URL environment variable
- [ ] Run: `npm run build && npm run csv`
- [ ] Test PDF upload: `curl -F "file=@doc.pdf" http://localhost:3000/csv/upload`
- [ ] Test Excel: `curl -F "file=@data.xlsx" http://localhost:3000/csv/upload`
- [ ] Test Image: `curl -F "file=@photo.jpg" http://localhost:3000/csv/upload`
- [ ] Deploy to Railway
- [ ] Verify in production

---

## Next Steps

1. **Keep UNSTRUCTURED_DEPLOYMENT.md** for service setup
2. **Delete or archive file-processor.ts** (not needed)
3. **Simplify index-csv-enhanced.ts** to call Unstructured.io directly
4. **Update package.json** - remove unused dependencies
5. **Deploy both services to Railway**
6. **Test with various file types**

This approach is cleaner, simpler, and more powerful! 🚀
