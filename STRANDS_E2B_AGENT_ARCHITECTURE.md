# Strands + E2B Agent Architecture for Intelligent Document Processing

## Executive Summary

Integrate **Strands autonomous agents with LLM reasoning** and **E2B sandboxed code execution** to transform the document processing pipeline from simple extraction to intelligent understanding and transformation.

**Benefits:**
- ✅ Agents understand document context and make intelligent decisions
- ✅ E2B sandbox provides secure code execution for transformations
- ✅ Self-correcting workflows that validate and fix data
- ✅ Extensible via prompts (no code changes)
- ✅ Audit trail of all agent decisions
- ✅ Parallel processing of multi-file ZIPs

---

## Architecture Overview

### Current State → Enhanced State

**BEFORE (Current):**
```
File → Unstructured.io → Raw Elements → PostgreSQL
```

**AFTER (Proposed):**
```
File(s) → Unstructured.io → Raw Elements → PostgreSQL
                                           ↓
                          Strands Agent (LLM-Powered)
                          ├─ Validate
                          ├─ Classify
                          ├─ Transform
                          └─ Decide: Need E2B?
                                     ↓
                           E2B Sandbox (Optional)
                           ├─ Parse complex formats
                           ├─ Run transformations
                           └─ Validate logic
                                     ↓
                          Store Enriched Results
```

---

## System Components

### 1. Agent Coordinator Service (New)

**File:** `src/agent-coordinator.ts`

Manages agent lifecycle and E2B sessions:

```typescript
interface ProcessingTask {
  fileId: string;
  fileName: string;
  format: string;
  rawElements: any[];
  resourcesUrl: string; // MCP server URL for agent access
  instructions: string; // Domain-specific processing instructions
}

interface AgentDecision {
  action: "validate" | "transform" | "enrich" | "skip";
  reasoning: string;
  needsE2B: boolean;
  e2bCode?: string;
  confidence: number;
  timestamp: Date;
}

class AgentCoordinator {
  async createProcessingTask(parsedData: any): Promise<ProcessingTask>
  async submitToAgent(task: ProcessingTask): Promise<AgentDecision>
  async executeE2BCode(code: string, data: any): Promise<any>
  async storeAgentDecision(decision: AgentDecision): Promise<void>
  async getProcessingHistory(fileId: string): Promise<AgentDecision[]>
}
```

### 2. E2B Integration Layer (New)

**File:** `src/e2b-executor.ts`

Securely execute agent-generated code:

```typescript
interface E2BSession {
  sessionId: string;
  language: "python" | "node";
  status: "active" | "completed" | "failed";
  createdAt: Date;
  timeout: number; // milliseconds
}

class E2BExecutor {
  async createSession(language: "python" | "node"): Promise<E2BSession>
  async executeCode(session: E2BSession, code: string): Promise<any>
  async dumpFiles(session: E2BSession): Promise<Buffer>
  async closeSession(session: E2BSession): Promise<void>
  async sanitizeCode(code: string): Promise<string> // Security check
}
```

### 3. Extended Agent (Enhanced)

**File:** `agents/intelligent_document_agent.py`

Strands agent with document understanding:

```python
class IntelligentDocumentAgent(Agent):
    """
    Autonomous agent for intelligent document processing.
    - Analyzes parsed document elements
    - Makes decisions about transformations
    - Executes code in E2B when needed
    - Stores reasoning and results
    """

    system_prompt = """
    You are an expert document analyst with the ability to:
    1. Analyze extracted document elements for quality and completeness
    2. Classify documents and extract structured data
    3. Identify transformations needed (data cleaning, format conversion)
    4. Decide when to request sandboxed code execution
    5. Generate Python code for complex transformations

    For each document, you should:
    - Validate the extraction quality
    - Classify the document type
    - Extract key data fields
    - Identify any data quality issues
    - Request E2B execution if needed for complex logic

    Always explain your reasoning and confidence level.
    """

    tools = [
        "query_parsed_elements",      # Get raw extraction
        "inspect_data_quality",       # Check validity
        "request_e2b_execution",      # Run code safely
        "store_enriched_data",        # Save results
        "classify_document",          # ML classification
        "extract_relationships",      # Find connections
    ]
```

### 4. MCP Tools for Agents (Extended)

Add these tools to the MCP server:

```typescript
// 1. Query raw parsed data
"query_parsed_elements": {
  params: { fileId, elementType?, limit? },
  returns: ParsedElement[]
}

// 2. Request E2B execution
"execute_in_sandbox": {
  params: {
    code: string,
    language: "python" | "node",
    inputData: any,
    timeout?: number
  },
  returns: ExecutionResult
}

// 3. Store enriched data
"store_enriched_document": {
  params: {
    fileId,
    enrichedData: any,
    agentReasoning: string,
    confidence: number
  },
  returns: { recordId, tableName }
}

// 4. Get document classification
"classify_document": {
  params: { elements: any[], hints?: string[] },
  returns: { type, confidence, schema }
}

// 5. Extract relationships
"find_relationships": {
  params: { elements: any[], entityTypes?: string[] },
  returns: RelationshipGraph
}
```

---

## Processing Workflow

### Detailed Flow

```
1. FILE UPLOAD
   ├─ Single file or ZIP
   ├─ Unstructured.io parsing
   └─ Store raw elements

2. QUEUE FOR AGENT
   ├─ Create ProcessingTask
   ├─ Set domain-specific instructions
   └─ Route to agent queue

3. AGENT ANALYSIS (Strands)
   ├─ Read parsed elements
   ├─ Analyze data quality
   ├─ Classify document
   ├─ Identify transformations
   └─ Decision: E2B needed?

4a. IF NO E2B NEEDED
   ├─ Validate data
   ├─ Store enriched results
   └─ Log agent decision

4b. IF E2B NEEDED
   ├─ Generate transformation code
   ├─ Create E2B session
   ├─ Execute code safely
   │  └─ Agent can iterate/refine
   ├─ Validate output
   └─ Store results + code history

5. RESULTS
   ├─ Enhanced PostgreSQL tables
   ├─ Agent reasoning stored
   ├─ Processing audit trail
   └─ Available for downstream use
```

---

## Example: Invoice Processing

### Setup
```python
# Create invoice-specific agent
invoice_agent = IntelligentDocumentAgent(
    model="claude-3-opus",
    instructions="""
    You are an invoice analyst. For each document:
    1. Verify it's an invoice
    2. Extract: vendor, date, amount, line items
    3. Validate dates and amounts
    4. Flag any suspicious patterns
    5. If dates are malformed, use E2B Python to parse them
    6. Return structured invoice data
    """
)
```

### Processing Invoice
```
Invoice PDF Uploaded
  ↓
Parse → 450 elements (text, tables, images)
  ↓
Agent receives elements
  ↓
Agent: "This is an invoice from Acme Corp, dated 2024-13-45 (invalid!)"
       "Need to parse date with Python dateutil"
  ↓
Request E2B session:
  Code: "
    from dateutil import parser
    import pandas as pd

    # Parse malformed dates
    dates = ['2024-13-45', '2024/1/5']
    parsed = [parser.parse(d, dayfirst=False) for d in dates]

    # Validate amounts
    amounts = [1000, 2500.50, -100]  # -100 is suspicious

    return {
      'dates': parsed,
      'amounts': amounts,
      'flags': ['negative_amount_found']
    }
  "
  ↓
E2B executes:
  - Parses dates correctly
  - Validates amounts
  - Returns cleaned data
  ↓
Agent stores results:
  - vendor_name: "Acme Corp"
  - invoice_date: 2024-01-05
  - total_amount: 3500.50
  - line_items: [...]
  - validation_flags: ["corrected_date_format"]
  - agent_confidence: 0.95
```

---

## Database Schema Extensions

### PostgreSQL Tables

```sql
-- Store agent decisions
CREATE TABLE agent_decisions (
  id SERIAL PRIMARY KEY,
  file_id UUID,
  action VARCHAR(50),
  reasoning TEXT,
  needed_e2b BOOLEAN,
  e2b_code TEXT,
  confidence DECIMAL(3,2),
  timestamp TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (file_id) REFERENCES files(id)
);

-- Store enriched data mappings
CREATE TABLE enriched_documents (
  id SERIAL PRIMARY KEY,
  file_id UUID,
  original_table VARCHAR(255),
  enriched_table VARCHAR(255),
  agent_reasoning TEXT,
  transformation_code TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- E2B execution history
CREATE TABLE e2b_executions (
  id SERIAL PRIMARY KEY,
  file_id UUID,
  session_id VARCHAR(255),
  code_executed TEXT,
  execution_time_ms INT,
  status VARCHAR(50),
  result_summary TEXT,
  errors TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Configuration & Instructions

### Domain-Specific Instructions

Create instruction files for different document types:

**`config/instructions/invoice.txt`**
```
You are processing financial invoices. For each document:

VALIDATION:
- Verify required fields: vendor, date, amount, items
- Check date format (YYYY-MM-DD)
- Verify amounts are positive
- Ensure line items match total

EXTRACTION:
- Vendor/supplier name
- Invoice date and due date
- Invoice number
- Total amount and currency
- Line items with quantities and amounts
- Tax amount
- Payment terms

TRANSFORMATION:
- Standardize vendor names (exact match in vendor master)
- Convert all amounts to USD
- Parse dates consistently
- Validate line item totals

E2B TRIGGERS:
- Complex date parsing (non-standard formats)
- Currency conversion
- Vendor name fuzzy matching
- Amount validation with business rules

OUTPUT:
Return as JSON with all fields, confidence scores, and any flags.
```

**`config/instructions/research_paper.txt`**
```
You are processing academic research papers. For each document:

CLASSIFICATION:
- Paper discipline (ML, biology, physics, etc.)
- Methodology type
- Data source

EXTRACTION:
- Title, authors, abstract
- Research questions
- Methodology
- Key findings
- Datasets used
- Related work references

KNOWLEDGE GRAPH:
- Create relationships: Author → Paper → Topic → Methodology
- Identify cited papers
- Track methodology evolution in citations

E2B TRIGGERS:
- Complex citation parsing
- Extract formulas/equations to LaTeX
- Generate metadata from citations
- Create citation graph structure

OUTPUT:
Structured paper record with relationships, metadata, and insights.
```

---

## Security & Safety

### E2B Code Sandbox Safeguards

```python
def sanitize_generated_code(code: str) -> str:
    """
    Validate agent-generated code before E2B execution
    """
    # Whitelist allowed imports
    allowed_imports = {
        'pandas', 'numpy', 'dateutil', 'json', 'csv',
        're', 'datetime', 'hashlib', 'base64'
    }

    # Blacklist dangerous operations
    forbidden = [
        'os.system', 'subprocess', 'eval', 'exec',
        '__import__', 'open', 'socket', 'requests'
    ]

    # Parse and validate AST
    tree = ast.parse(code)
    validator = ASTValidator(allowed_imports, forbidden)
    validator.visit(tree)

    if not validator.is_safe():
        raise SecurityError(f"Code not safe: {validator.errors}")

    return code
```

### Rate Limiting & Costs

```python
# Track E2B usage per file
class E2BBudget:
    max_sessions_per_file = 3
    max_execution_time_ms = 30000
    max_memory_mb = 1024

    def can_execute(self, file_metrics) -> bool:
        return (
            file_metrics.sessions < self.max_sessions_per_file and
            file_metrics.total_time < self.max_execution_time_ms
        )
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
- ✅ Agent coordinator service
- ✅ E2B executor layer
- ✅ Database schema updates
- ✅ Extended MCP tools
- **Deliverable:** Simple validation agent (no code generation yet)

### Phase 2: Intelligence (Week 2)
- Strands agent with document understanding
- Document classification
- Data extraction patterns
- Confidence scoring
- **Deliverable:** Agents validate and classify documents

### Phase 3: Automation (Week 3)
- Agent code generation
- E2B integration
- Code sanitization & safety
- Transformation execution
- **Deliverable:** Agents write and execute transformation code

### Phase 4: Optimization (Week 4)
- Parallel processing
- Performance tuning
- Domain-specific prompts
- Cost analysis & optimization
- **Deliverable:** Production-ready system

---

## API Changes

### New Endpoints

```
POST /process/intelligent
├─ Intelligent document processing
├─ Body: { fileId, instructions?, model?, options? }
└─ Response: { agentId, decisions, enrichedTableNames }

GET /agent/:agentId/reasoning
├─ Get agent's decision reasoning
└─ Response: { decisions[], confidence, code }

GET /enrichment/:fileId
├─ Get all enrichment results
└─ Response: { original, enriched, transformations }

POST /agent/execute-code
├─ Direct E2B code execution (admin only)
├─ Body: { code, language, data, timeout }
└─ Response: { result, executionTime, status }
```

---

## Example Response

```json
{
  "fileId": "doc-12345",
  "fileName": "invoice_2024_001.pdf",
  "agentAnalysis": {
    "classification": {
      "type": "invoice",
      "confidence": 0.98
    },
    "validationResult": {
      "isValid": true,
      "issues": ["date_format_corrected"],
      "confidence": 0.92
    },
    "extractedData": {
      "vendor": "Acme Corp",
      "invoiceDate": "2024-01-15",
      "amount": 3500.50,
      "items": [...]
    },
    "decisionsLog": [
      {
        "action": "validate",
        "reasoning": "Checked required fields",
        "timestamp": "2024-01-15T10:30:00Z"
      },
      {
        "action": "transform",
        "reasoning": "Date was malformed, used E2B to correct",
        "e2bExecuted": true,
        "executionTime": 245
      }
    ]
  },
  "enrichedTable": "invoices_enhanced_20240115",
  "agentConfidence": 0.95
}
```

---

## Monitoring & Observability

```python
# Track agent performance
metrics = {
    "documents_processed": 1250,
    "agent_accuracy": 0.96,
    "e2b_usage_rate": 0.35,  # 35% of docs needed code
    "avg_processing_time": 4.5,  # seconds
    "avg_e2b_time": 1.2,  # seconds
    "error_rate": 0.02,
    "agent_costs": 1.25,  # dollars per agent run
}

# Log all decisions for auditing
audit_trail = {
    "fileId": "doc-12345",
    "agentModel": "claude-3-opus",
    "decisions": [...],
    "codeExecuted": [...],
    "finalQuality": 0.95,
}
```

---

## Extensibility

### Adding New Document Types

Simply create a new instruction file:

```
1. Create: config/instructions/your_type.txt
2. Deploy new instruction
3. Route documents to agent with new instructions
4. Agents automatically adapt
```

No code changes required!

---

## Cost Considerations

- **Claude API**: ~$0.003 per document analysis
- **E2B**: ~$0.05 per session (1-2 min execution)
- **Total per document**: $0.003 - $0.053 depending on complexity
- **ROI**: Massive for bulk processing (vs manual analysis)

---

## Conclusion

This architecture transforms the document processing pipeline from simple extraction to intelligent, self-correcting, and extensible processing. The combination of:

- **Strands Agents**: For reasoning and decision-making
- **E2B Sandbox**: For safe, complex transformations
- **Unstructured.io**: For universal extraction
- **PostgreSQL + Valkey**: For storage and caching

Creates a powerful, enterprise-grade document intelligence system.

---

*Architecture Design: November 13, 2025*
*Status: Ready for Implementation*
