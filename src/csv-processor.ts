/**
 * CSV Processing Workflow Module
 * Orchestrates CSV upload, parsing, caching, and PostgreSQL insertion
 */

import { createReadStream, mkdirSync } from "fs";
import { unlink } from "fs/promises";
import { join } from "path";
import csvParser from "csv-parser";
import { PostgresService } from "./postgres.js";
import { ValkeyService, CSVProcessingJob } from "./valkey.js";
import crypto from "crypto";

export interface CSVProcessingOptions {
  tableName?: string;
  batchSize?: number;
  validateColumns?: string[];
}

export interface ProcessingResult {
  jobId: string;
  success: boolean;
  tableName: string;
  rowsProcessed: number;
  rowsFailed: number;
  duration: number;
  error?: string;
  cachedInValkey: boolean;
}

export class CSVProcessor {
  private postgres: PostgresService;
  private valkey: ValkeyService;
  private uploadDir: string;

  constructor(postgres: PostgresService, valkey: ValkeyService, uploadDir: string = "/tmp/csv-uploads") {
    this.postgres = postgres;
    this.valkey = valkey;
    this.uploadDir = uploadDir;

    // Create upload directory if it doesn't exist
    try {
      mkdirSync(uploadDir, { recursive: true });
    } catch (error) {
      console.error("Failed to create upload directory:", error);
    }
  }

  /**
   * Process CSV file end-to-end
   */
  async processCSVFile(
    filePath: string,
    fileName: string,
    options: CSVProcessingOptions = {}
  ): Promise<ProcessingResult> {
    const startTime = Date.now();
    const jobId = this.generateJobId();
    const tableName = options.tableName || this.sanitizeTableName(fileName);
    const batchSize = options.batchSize || 100;

    const job: CSVProcessingJob = {
      id: jobId,
      status: "processing",
      fileName,
      tableName,
      rowCount: 0,
      processedRows: 0,
      uploadedAt: new Date(),
      startedAt: new Date(),
    };

    try {
      // Store initial job in Valkey
      await this.valkey.storeJob(job);
      await this.valkey.enqueueJob(jobId);

      // Parse and validate CSV
      console.log(`🔄 Processing CSV: ${fileName}`);
      const rows = await this.parseCSV(filePath, options.validateColumns);

      if (rows.length === 0) {
        throw new Error("CSV file is empty or could not be parsed");
      }

      job.rowCount = rows.length;

      // Cache parsed data in Valkey
      console.log(`💾 Caching ${rows.length} rows in Valkey...`);
      await this.valkey.cacheCSVData(jobId, rows);

      // Create table in PostgreSQL
      console.log(`📊 Creating table "${tableName}" in PostgreSQL...`);
      const columns = this.inferColumnsFromData(rows[0]);
      await this.postgres.createCSVTable(tableName, columns);

      // Insert data into PostgreSQL with batching
      console.log(`📝 Inserting data into PostgreSQL (batch size: ${batchSize})...`);
      const insertedCount = await this.postgres.insertRowsBatch(tableName, rows, batchSize);
      job.processedRows = insertedCount;

      // Update job status to completed
      await this.valkey.updateJobStatus(jobId, "completed", {
        completedAt: new Date(),
        processedRows: insertedCount,
      });

      console.log(`✅ Processing complete: ${insertedCount} rows imported`);

      const duration = Date.now() - startTime;
      return {
        jobId,
        success: true,
        tableName,
        rowsProcessed: insertedCount,
        rowsFailed: 0,
        duration,
        cachedInValkey: true,
      };
    } catch (error: any) {
      // Update job status to failed
      const errorMessage = error.message || String(error);
      await this.valkey.updateJobStatus(jobId, "failed", {
        error: errorMessage,
        completedAt: new Date(),
      });

      console.error(`❌ Processing failed for ${fileName}:`, error);

      const duration = Date.now() - startTime;
      return {
        jobId,
        success: false,
        tableName,
        rowsProcessed: job.processedRows,
        rowsFailed: job.rowCount - job.processedRows,
        duration,
        error: errorMessage,
        cachedInValkey: false,
      };
    } finally {
      // Clean up uploaded file
      try {
        await unlink(filePath);
        console.log(`🗑️  Temporary file cleaned up: ${filePath}`);
      } catch (error) {
        console.warn(`Warning: Failed to delete temporary file: ${filePath}`);
      }
    }
  }

  /**
   * Parse CSV file and return rows
   */
  private async parseCSV(filePath: string, validateColumns?: string[]): Promise<Record<string, any>[]> {
    return new Promise((resolve, reject) => {
      const rows: Record<string, any>[] = [];

      createReadStream(filePath)
        .pipe(csvParser())
        .on("data", (row) => {
          // Validate columns if specified
          if (validateColumns) {
            const hasAllColumns = validateColumns.every((col) => col in row);
            if (!hasAllColumns) {
              console.warn(
                "Row missing required columns:",
                Object.keys(row),
                "expected:",
                validateColumns
              );
              return;
            }
          }

          // Clean up row values
          const cleanedRow = Object.fromEntries(
            Object.entries(row).map(([key, value]) => [
              key.trim(),
              typeof value === "string" ? value.trim() : value,
            ])
          );

          rows.push(cleanedRow);
        })
        .on("end", () => {
          console.log(`✅ Parsed ${rows.length} rows from CSV`);
          resolve(rows);
        })
        .on("error", (error) => {
          console.error("CSV parsing error:", error);
          reject(new Error(`Failed to parse CSV: ${error.message}`));
        });
    });
  }

  /**
   * Infer column types from data
   */
  private inferColumnsFromData(
    row: Record<string, any>
  ): { name: string; type: string }[] {
    return Object.entries(row).map(([name, value]) => {
      let type = "TEXT";

      if (value === null || value === undefined || value === "") {
        type = "TEXT";
      } else if (!isNaN(Number(value)) && value !== "") {
        type = "DECIMAL(10, 2)";
      } else if (value.toLowerCase() === "true" || value.toLowerCase() === "false") {
        type = "BOOLEAN";
      } else if (this.isValidDate(value)) {
        type = "TIMESTAMP";
      } else {
        type = "TEXT";
      }

      return {
        name: this.sanitizeColumnName(name),
        type,
      };
    });
  }

  /**
   * Validate if string is a valid date
   */
  private isValidDate(dateString: string): boolean {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date as any);
  }

  /**
   * Sanitize table name for PostgreSQL
   */
  private sanitizeTableName(fileName: string): string {
    return fileName
      .replace(/\.[^/.]+$/, "") // Remove file extension
      .replace(/[^a-zA-Z0-9_]/g, "_") // Replace invalid chars with underscore
      .toLowerCase()
      .substring(0, 63); // PostgreSQL table name limit
  }

  /**
   * Sanitize column name for PostgreSQL
   */
  private sanitizeColumnName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9_]/g, "_") // Replace invalid chars with underscore
      .toLowerCase()
      .substring(0, 63); // PostgreSQL column name limit
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `job-${crypto.randomBytes(12).toString("hex")}-${Date.now()}`;
  }

  /**
   * Get processing status
   */
  async getStatus(jobId: string): Promise<CSVProcessingJob | null> {
    return this.valkey.getJob(jobId);
  }

  /**
   * Get all processing jobs
   */
  async getAllJobs(): Promise<CSVProcessingJob[]> {
    return this.valkey.listJobs();
  }

  /**
   * Clean up processed data from Valkey (optional)
   */
  async cleanupJob(jobId: string): Promise<void> {
    await this.valkey.clearJob(jobId);
    console.log(`🗑️  Job ${jobId} cleaned up from Valkey`);
  }

  /**
   * Get cached CSV data
   */
  async getCachedData(jobId: string): Promise<Record<string, any>[]> {
    return this.valkey.getCSVData(jobId);
  }

  /**
   * Query processed data from PostgreSQL
   */
  async queryTableData(tableName: string, limit: number = 100): Promise<Record<string, any>[]> {
    return this.postgres.queryTable(tableName, limit);
  }

  /**
   * Get table statistics
   */
  async getTableStats(tableName: string): Promise<{
    tableName: string;
    rowCount: number;
    columns: string[];
  }> {
    const rowCount = await this.postgres.getRowCount(tableName);
    const result = await this.postgres
      .getPool()
      .query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
        [tableName]
      );
    const columns = result.rows
      .map((r: any) => r.column_name)
      .filter((col: string) => col !== "id" && col !== "created_at");

    return {
      tableName,
      rowCount,
      columns,
    };
  }
}

export default CSVProcessor;
