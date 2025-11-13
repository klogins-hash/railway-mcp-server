# Multi-File Format Processing Strategy

## The Question: Unstructured.io vs Custom Solution?

**Answer: Both!** Use a **hybrid approach**:
- ✅ Custom lightweight parsers for common formats (CSV, JSON, XLSX, JSONL)
- ✅ Integration path to Unstructured.io for advanced document parsing (PDF, DOC, PPT)
- ✅ Plugin architecture for flexibility

---

## Recommendation Matrix

| Format | Custom | Unstructured | Recommendation |
|--------|--------|--------------|-----------------|
| CSV | ✅ Simple | ❌ Overkill | **Custom** |
| JSON | ✅ Built-in | ❌ Overkill | **Custom** |
| JSONL | ✅ Simple | ❌ Overkill | **Custom** |
| XLSX | ✅ Moderate | ✅ Good | **Custom** |
| Parquet | ✅ Possible | ✅ Good | **Custom** |
| PDF | ❌ Complex | ✅ Excellent | **Unstructured** |
| Word (.docx) | ❌ Complex | ✅ Excellent | **Unstructured** |
| PowerPoint | ❌ Complex | ✅ Excellent | **Unstructured** |
| Images (OCR) | ❌ Very Complex | ✅ Perfect | **Unstructured** |
| Tables (any) | ⚠️ Depends | ✅ Great | **Unstructured** |

---

## Proposed Architecture

### Phase 1: Custom Built-in Parsers (Implement Now)
```
Upload Handler
    ├─ CSV → csv-parser
    ├─ JSON → JSON.parse
    ├─ JSONL → line-by-line JSON
    ├─ XLSX → xlsx library
    ├─ Parquet → arrow library
    └─ Other → Try Unstructured.io
```

### Phase 2: Unstructured.io Integration (Add Later)
```
Upload Handler (with Unstructured option)
    ├─ Common formats → Custom
    ├─ Complex docs → Unstructured.io API
    └─ Fallback → Custom conversion
```

---

## Implementation Plan

### Step 1: Add Custom Parsers (TypeScript)

**Dependencies to add:**
```json
{
  "xlsx": "^0.18.5",
  "papaparse": "^5.4.1",
  "apache-arrow": "^13.0.0"
}
```

**Create `src/file-processor.ts`:**
```typescript
export interface FileParsingResult {
  format: string;
  rows: Record<string, any>[];
  metadata: {
    rowCount: number;
    columnCount: number;
    columns: string[];
    inferredSchema: Record<string, string>;
  };
}

export class FileProcessor {
  // Detects file type
  detectFormat(filename: string): string { }

  // Routes to appropriate parser
  parseFile(buffer: Buffer, format: string): FileParsingResult { }

  // Individual parsers
  parseCSV(buffer: Buffer): FileParsingResult { }
  parseJSON(buffer: Buffer): FileParsingResult { }
  parseJSONL(buffer: Buffer): FileParsingResult { }
  parseXLSX(buffer: Buffer): FileParsingResult { }
  parseParquet(buffer: Buffer): FileParsingResult { }
}
```

### Step 2: Extend Upload Endpoint

**Update `/upload` endpoint:**
```typescript
// Accept any file type
app.post('/upload',
  authenticateApiKey,
  upload.single('file'),
  async (req, res) => {
    const format = detectFormat(req.file.originalname);

    // Try custom parser first
    let result = await tryCustomParser(req.file.buffer, format);

    // Fallback to Unstructured.io if enabled
    if (!result && config.unstructuredEnabled) {
      result = await tryUnstructuredParser(req.file, format);
    }

    // Process result same as CSV
    const processed = await csvProcessor.processData(result);
    res.json(processed);
  }
);
```

### Step 3: Optional Unstructured.io Integration

**When you need it:**
```bash
# 1. Sign up at unstructured.io
# 2. Get API key
# 3. Add to environment
export UNSTRUCTURED_API_KEY=your-key
export UNSTRUCTURED_ENABLED=true

# 4. Install Python wrapper
pip install unstructured[pdf,image]

# 5. Add to requirements.txt
```

---

## Comparison Table

### Custom Built-in Parsers

**Pros:**
- ✅ No external dependencies for common formats
- ✅ Fast (local processing)
- ✅ Full control
- ✅ No API calls = no latency
- ✅ Works offline
- ✅ Cost: $0

**Cons:**
- ❌ Limited to structured data formats
- ❌ No advanced table extraction
- ❌ No OCR capability
- ❌ Need to maintain parsers

**Best for:** Structured data (CSV, JSON, XLSX)

---

### Unstructured.io

**Pros:**
- ✅ Handles any document format
- ✅ Table extraction from PDFs
- ✅ OCR for images
- ✅ Expert-maintained
- ✅ No maintenance burden
- ✅ Structured output

**Cons:**
- ❌ External API dependency
- ❌ Network latency
- ❌ API rate limits
- ❌ Cost per API call
- ❌ Privacy concerns (data to external service)

**Best for:** Unstructured docs (PDF, Word, PPT, Images)

---

## Recommended Implementation

### Architecture Layers

```mermaid
graph top-down
    A["User Uploads File"] --> B["File Format Detection"]
    B --> C{Is Structured?}
    C -->|CSV, JSON, XLSX| D["Custom Parser"]
    C -->|PDF, Word, etc| E{Unstructured Enabled?}
    E -->|Yes| F["Unstructured.io API"]
    E -->|No| G["Reject or Convert"]
    D --> H["Normalize to Rows"]
    F --> H
    H --> I["CSV Processor Pipeline"]
    I --> J["Valkey + PostgreSQL"]
```

### Implementation Steps

1. **Create `src/file-processor.ts`**
   - CSV parser (already have)
   - JSON parser
   - JSONL parser
   - XLSX parser
   - Parquet parser
   - Generic fallback

2. **Create `src/unstructured-client.ts`** (optional)
   - API client for Unstructured.io
   - Document parsing
   - Table extraction
   - OCR handling

3. **Update `/upload` endpoint**
   - Detect file format
   - Try appropriate parser
   - Fallback to Unstructured.io if configured
   - Same processing pipeline

4. **Add configuration**
   - `SUPPORTED_FORMATS` list
   - `UNSTRUCTURED_ENABLED` flag
   - `UNSTRUCTURED_API_KEY` secret

---

## Cost Comparison

### Custom Parsers
- Development: 4-8 hours
- Maintenance: 2-4 hours/month
- Runtime cost: $0
- Latency: <100ms
- Formats: 5-6 types

### Unstructured.io
- Development: 1-2 hours (integration)
- Maintenance: 0 hours
- Runtime cost: $0.00-0.10 per document
- Latency: 1-5 seconds
- Formats: 20+ types

### Hybrid (Recommended)
- Development: 6-10 hours
- Maintenance: 2-4 hours/month
- Runtime cost: $0-0.05 per document
- Latency: <100ms for structured, 1-5s for complex
- Formats: 10+ types instantly, 20+ with fallback

---

## Quick Implementation Guide

### Option 1: Start with Custom (Recommended)

```bash
# 1. Add dependencies
npm install xlsx papaparse apache-arrow

# 2. Create file-processor.ts (see below)

# 3. Update endpoint to use FileProcessor

# 4. Test with various file types

# 5. Later add Unstructured.io if needed
```

### Option 2: Start with Unstructured.io (Expensive)

```bash
# 1. Sign up: https://unstructured.io
# 2. Get API key
# 3. Create unstructured-client.ts that calls their API
# 4. Update endpoint
# 5. Works for everything but higher cost
```

### Option 3: Hybrid from Day 1 (Best)

```bash
# 1. Implement Option 1 (custom)
# 2. Add Optional Unstructured.io integration
# 3. Use custom for 80% of cases
# 4. Use Unstructured.io for edge cases
# 5. Best of both worlds!
```

---

## What to Build Next

**Priority 1 (Do Now):**
- [ ] CSV parser (already have)
- [ ] JSON/JSONL parser
- [ ] XLSX parser
- [ ] Generic error handler

**Priority 2 (This Week):**
- [ ] Move to `FileProcessor` abstraction
- [ ] Update upload endpoint
- [ ] Add format detection
- [ ] Test with 5 file types

**Priority 3 (This Month):**
- [ ] Add Parquet support
- [ ] Unstructured.io integration option
- [ ] Format conversion utilities

**Priority 4 (Future):**
- [ ] Advanced PDF parsing
- [ ] Table extraction
- [ ] Image OCR
- [ ] Audio transcription

---

## My Recommendation

**Use the Hybrid Approach:**

1. **Start now with custom parsers** for CSV, JSON, JSONL, XLSX
   - Fast to implement (~4 hours)
   - Zero cost to run
   - Covers 80% of use cases
   - Full control

2. **Add Unstructured.io integration point**
   - Plugin architecture ready
   - Enable when needed
   - For PDF, Word, PPT, etc.
   - Pay only when used

3. **Benefit from both:**
   - Fast, cheap processing for common formats
   - Powerful document handling when needed
   - Flexible architecture for growth

---

## Next Steps

Would you like me to:

1. **Implement the `FileProcessor` class** with CSV, JSON, XLSX parsers?
2. **Update the upload endpoint** to use multi-format processing?
3. **Create the Unstructured.io integration** (optional layer)?
4. **Build format detection** and routing logic?

Let me know which you'd like me to prioritize!
