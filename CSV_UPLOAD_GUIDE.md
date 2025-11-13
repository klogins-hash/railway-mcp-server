# CSV Upload & Database Integration Guide

## Overview

The enhanced Railway MCP Server now supports CSV file uploads with automatic PostgreSQL database integration and Valkey caching. This guide covers how to use the new CSV processing features.

## Features

✅ **CSV Upload** - Upload and parse CSV files
✅ **PostgreSQL Integration** - Automatic table creation and batch insertion
✅ **Valkey Caching** - In-memory caching for quick access to processed data
✅ **Job Tracking** - Monitor CSV processing status in real-time
✅ **Query Interface** - Query imported data directly from PostgreSQL
✅ **MCP Tools** - Use via Claude/MCP inspector for autonomous processing

## Architecture

```
CSV File Upload
    ↓
Multer (File Handling)
    ↓
CSV Parser (csv-parser)
    ↓
Valkey Cache (Store parsed data)
    ↓
PostgreSQL (Create table & insert)
    ↓
Job Status Tracking
```

## Requirements

### Environment Variables

Set these in your Railway environment:

```bash
DATABASE_URL=postgresql://user:password@host:port/database
# or POSTGRES_URL for PostgreSQL
VALKEY_URL=redis://username:password@host:port/db
# or REDIS_URL for Redis
API_KEY=your-secure-api-key
PORT=3000
```

### Linked Services

The project requires:
1. **PostgreSQL** - For data persistence
2. **Valkey/Redis** - For caching and job orchestration
3. **Railway MCP Server** - This service

## HTTP Endpoints

### 1. Upload CSV File

**POST** `/csv/upload`

Upload a CSV file and automatically process it.

**Headers:**
```
X-API-Key: your-api-key
Content-Type: multipart/form-data
```

**Body Parameters:**
- `file` (required) - The CSV file to upload
- `tableName` (optional) - Custom table name. If not provided, derives from filename
- `batchSize` (optional) - Rows per batch (default: 100)

**Example using curl:**
```bash
curl -X POST http://localhost:3000/csv/upload \
  -H "X-API-Key: your-api-key" \
  -F "file=@data.csv" \
  -F "tableName=my_data" \
  -F "batchSize=200"
```

**Example using Python:**
```python
import requests

with open('data.csv', 'rb') as f:
    files = {'file': f}
    data = {'tableName': 'my_data', 'batchSize': 100}
    headers = {'X-API-Key': 'your-api-key'}

    response = requests.post(
        'http://localhost:3000/csv/upload',
        files=files,
        data=data,
        headers=headers
    )

    print(response.json())
```

**Response:**
```json
{
  "jobId": "job-a1b2c3d4e5f6-1699876500000",
  "success": true,
  "tableName": "my_data",
  "rowsProcessed": 1000,
  "rowsFailed": 0,
  "duration": 5234,
  "cachedInValkey": true,
  "message": "CSV processed successfully"
}
```

### 2. Get Job Status

**GET** `/csv/jobs/:jobId`

Check the status of a CSV processing job.

**Headers:**
```
X-API-Key: your-api-key
```

**Example:**
```bash
curl -X GET http://localhost:3000/csv/jobs/job-a1b2c3d4e5f6-1699876500000 \
  -H "X-API-Key: your-api-key"
```

**Response:**
```json
{
  "job": {
    "id": "job-a1b2c3d4e5f6-1699876500000",
    "status": "completed",
    "fileName": "data.csv",
    "tableName": "my_data",
    "rowCount": 1000,
    "processedRows": 1000,
    "uploadedAt": "2024-11-13T09:55:00.000Z",
    "startedAt": "2024-11-13T09:55:01.000Z",
    "completedAt": "2024-11-13T09:55:05.234Z"
  },
  "timestamp": "2024-11-13T09:55:10.000Z"
}
```

### 3. List All Jobs

**GET** `/csv/jobs`

Get a list of all CSV processing jobs.

**Headers:**
```
X-API-Key: your-api-key
```

**Example:**
```bash
curl -X GET http://localhost:3000/csv/jobs \
  -H "X-API-Key: your-api-key"
```

**Response:**
```json
{
  "total": 3,
  "jobs": [
    {
      "id": "job-a1b2c3d4e5f6-1699876500000",
      "status": "completed",
      "fileName": "data.csv",
      "tableName": "my_data",
      ...
    }
  ],
  "timestamp": "2024-11-13T09:55:10.000Z"
}
```

### 4. Query Table Data

**GET** `/csv/tables/:tableName/data`

Query data from a CSV-imported table.

**Headers:**
```
X-API-Key: your-api-key
```

**Query Parameters:**
- `limit` (optional) - Max rows to return (default: 100)

**Example:**
```bash
curl -X GET 'http://localhost:3000/csv/tables/my_data/data?limit=50' \
  -H "X-API-Key: your-api-key"
```

**Response:**
```json
{
  "tableName": "my_data",
  "rowCount": 50,
  "data": [
    {
      "id": 1,
      "created_at": "2024-11-13T09:55:01.000Z",
      "name": "John",
      "email": "john@example.com",
      "age": "30"
    },
    ...
  ],
  "timestamp": "2024-11-13T09:55:10.000Z"
}
```

### 5. Get Table Statistics

**GET** `/csv/tables/:tableName/stats`

Get statistics about a table (row count, columns).

**Headers:**
```
X-API-Key: your-api-key
```

**Example:**
```bash
curl -X GET http://localhost:3000/csv/tables/my_data/stats \
  -H "X-API-Key: your-api-key"
```

**Response:**
```json
{
  "stats": {
    "tableName": "my_data",
    "rowCount": 1000,
    "columns": ["name", "email", "age", "city"]
  },
  "timestamp": "2024-11-13T09:55:10.000Z"
}
```

### 6. Get Cached CSV Data

**GET** `/csv/cache/:jobId`

Retrieve parsed CSV data cached in Valkey.

**Headers:**
```
X-API-Key: your-api-key
```

**Example:**
```bash
curl -X GET http://localhost:3000/csv/cache/job-a1b2c3d4e5f6-1699876500000 \
  -H "X-API-Key: your-api-key"
```

**Response:**
```json
{
  "jobId": "job-a1b2c3d4e5f6-1699876500000",
  "rowCount": 1000,
  "data": [
    {
      "name": "John",
      "email": "john@example.com"
    },
    ...
  ],
  "timestamp": "2024-11-13T09:55:10.000Z"
}
```

### 7. Clean Up Job

**DELETE** `/csv/jobs/:jobId`

Remove cached data and job tracking for a completed job.

**Headers:**
```
X-API-Key: your-api-key
```

**Example:**
```bash
curl -X DELETE http://localhost:3000/csv/jobs/job-a1b2c3d4e5f6-1699876500000 \
  -H "X-API-Key: your-api-key"
```

**Response:**
```json
{
  "message": "Job cleaned up successfully",
  "jobId": "job-a1b2c3d4e5f6-1699876500000",
  "timestamp": "2024-11-13T09:55:10.000Z"
}
```

## MCP Tools

When using the MCP Inspector, you have access to these additional tools:

### query_csv_table

Query data from a PostgreSQL table imported from CSV.

**Parameters:**
- `tableName` (required) - Table name to query
- `limit` (optional) - Max rows (default: 100)

### get_table_stats

Get table statistics (row count, columns).

**Parameters:**
- `tableName` (required) - Table name

### list_csv_jobs

List all active CSV processing jobs.

### get_csv_job_status

Get status of a specific job.

**Parameters:**
- `jobId` (required) - Job ID

## CSV Processing Workflow

1. **Upload** - Send CSV file via HTTP POST
2. **Parse** - csv-parser reads and validates rows
3. **Type Inference** - Automatically detects column types
4. **Cache** - Parsed data stored in Valkey (chunks of 100 rows)
5. **Create Table** - PostgreSQL table created with inferred schema
6. **Insert** - Rows inserted in batches for performance
7. **Track** - Job status stored in Valkey (24-hour TTL)

## Data Type Inference

The processor automatically infers column types:

| Value Pattern | Inferred Type |
|---|---|
| `nulls/empty` | TEXT |
| `numeric` | DECIMAL(10,2) |
| `true/false` | BOOLEAN |
| `date strings` | TIMESTAMP |
| `other` | TEXT |

## Error Handling

If CSV processing fails:

1. Job status updates to `failed`
2. Error message stored in job record
3. Temporary file cleaned up
4. Job data remains in Valkey for inspection

**Example failed response:**
```json
{
  "jobId": "job-a1b2c3d4e5f6-1699876500000",
  "success": false,
  "tableName": "my_data",
  "rowsProcessed": 500,
  "rowsFailed": 500,
  "duration": 2000,
  "error": "Table already exists",
  "cachedInValkey": false
}
```

## Best Practices

1. **File Size** - Max 50MB per upload
2. **Batch Size** - Use larger batches (200-500) for big files
3. **CSV Format** - Ensure headers and consistent columns
4. **API Key** - Use strong, unique API keys in production
5. **Cleanup** - Call DELETE endpoint for old jobs to free Valkey memory
6. **Monitoring** - Check job status periodically for long-running imports

## Example Workflow

```bash
#!/bin/bash

API_KEY="your-secure-api-key"
API_URL="http://localhost:3000"

# 1. Upload CSV
RESPONSE=$(curl -s -X POST $API_URL/csv/upload \
  -H "X-API-Key: $API_KEY" \
  -F "file=@users.csv" \
  -F "tableName=users" \
  -F "batchSize=50")

JOB_ID=$(echo $RESPONSE | jq -r '.jobId')
echo "Job ID: $JOB_ID"

# 2. Check status
curl -s -X GET $API_URL/csv/jobs/$JOB_ID \
  -H "X-API-Key: $API_KEY" | jq '.job.status'

# 3. Query data
curl -s -X GET "$API_URL/csv/tables/users/data?limit=10" \
  -H "X-API-Key: $API_KEY" | jq '.data'

# 4. Get statistics
curl -s -X GET $API_URL/csv/tables/users/stats \
  -H "X-API-Key: $API_KEY" | jq '.stats'

# 5. Cleanup
curl -s -X DELETE $API_URL/csv/jobs/$JOB_ID \
  -H "X-API-Key: $API_KEY"
```

## Deployment Notes

### Railway Configuration

1. Add PostgreSQL service to the project
2. Add Valkey/Redis service to the project
3. Link DATABASE_URL and VALKEY_URL environment variables
4. Set API_KEY in Railway environment variables
5. Deploy the new version with `npm run build`

### Testing Locally

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# In another terminal, test upload
curl -X POST http://localhost:3000/csv/upload \
  -H "X-API-Key: change-me-in-production" \
  -F "file=@test.csv"
```

## Troubleshooting

**"Database services unavailable"**
- Check DATABASE_URL and VALKEY_URL are set
- Verify PostgreSQL and Valkey services are running
- Check service connectivity from Railway dashboard

**"CSV file is empty or could not be parsed"**
- Verify CSV format (headers, consistent columns)
- Check file encoding (should be UTF-8)
- Try with a smaller test file first

**"Table already exists"**
- Provide a custom `tableName` parameter
- Or drop the existing table manually
- Or use a different filename

**"Out of memory"**
- Reduce `limit` parameter when querying
- Reduce batch size for very large files
- Clean up old jobs with DELETE endpoint

## Performance Notes

- **Small files** (< 10K rows): < 1 second
- **Medium files** (10K-100K rows): 5-15 seconds
- **Large files** (100K+ rows): 30+ seconds

Batch size affects performance. Larger batches = faster inserts but higher memory.

## Next Steps

1. Deploy the enhanced server to Railway
2. Test CSV upload workflow
3. Monitor job status and database growth
4. Integrate with AI agent for autonomous processing
5. Build UI dashboard for CSV management

---

For more help, check the main README.md or consult the Railway MCP Server documentation.
