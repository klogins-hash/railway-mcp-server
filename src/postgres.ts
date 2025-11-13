/**
 * PostgreSQL Integration Module
 * Handles database connections and CSV data persistence
 */

import { Pool, Client } from "pg";

export interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

export class PostgresService {
  private pool: Pool | null = null;
  private config: PostgresConfig;

  constructor(config: PostgresConfig) {
    this.config = config;
  }

  /**
   * Initialize database connection pool
   */
  async initialize(): Promise<void> {
    try {
      this.pool = new Pool({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        ssl: this.config.ssl || false,
      });

      // Test connection
      const client = await this.pool.connect();
      const result = await client.query("SELECT NOW()");
      console.log("✅ PostgreSQL connected at", result.rows[0].now);
      client.release();
    } catch (error) {
      console.error("❌ PostgreSQL connection failed:", error);
      throw error;
    }
  }

  /**
   * Create CSV table if it doesn't exist
   */
  async createCSVTable(tableName: string, columns: { name: string; type: string }[]): Promise<void> {
    if (!this.pool) throw new Error("Pool not initialized");

    const columnDefs = columns.map((c) => `"${c.name}" ${c.type}`).join(", ");
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS "${tableName}" (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ${columnDefs}
      )
    `;

    try {
      await this.pool.query(createTableSQL);
      console.log(`✅ Table "${tableName}" ready`);
    } catch (error) {
      console.error(`❌ Failed to create table "${tableName}":`, error);
      throw error;
    }
  }

  /**
   * Insert CSV rows into database
   */
  async insertRows(tableName: string, rows: Record<string, any>[]): Promise<number> {
    if (!this.pool) throw new Error("Pool not initialized");
    if (rows.length === 0) return 0;

    const columns = Object.keys(rows[0]);
    const columnList = columns.map((c) => `"${c}"`).join(", ");
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");

    let insertedCount = 0;

    try {
      for (const row of rows) {
        const values = columns.map((col) => row[col]);
        const insertSQL = `INSERT INTO "${tableName}" (${columnList}) VALUES (${placeholders})`;

        await this.pool.query(insertSQL, values);
        insertedCount++;
      }

      console.log(`✅ Inserted ${insertedCount} rows into "${tableName}"`);
      return insertedCount;
    } catch (error) {
      console.error(`❌ Failed to insert rows into "${tableName}":`, error);
      throw error;
    }
  }

  /**
   * Batch insert CSV rows for better performance
   */
  async insertRowsBatch(tableName: string, rows: Record<string, any>[], batchSize: number = 100): Promise<number> {
    if (!this.pool) throw new Error("Pool not initialized");
    if (rows.length === 0) return 0;

    const columns = Object.keys(rows[0]);
    let insertedCount = 0;

    try {
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const values: any[] = [];
        const placeholders: string[] = [];

        batch.forEach((row, rowIndex) => {
          const rowPlaceholders = columns
            .map((col, colIndex) => {
              const paramIndex = rowIndex * columns.length + colIndex + 1;
              values.push(row[col]);
              return `$${paramIndex}`;
            })
            .join(", ");
          placeholders.push(`(${rowPlaceholders})`);
        });

        const columnList = columns.map((c) => `"${c}"`).join(", ");
        const insertSQL = `INSERT INTO "${tableName}" (${columnList}) VALUES ${placeholders.join(", ")}`;

        await this.pool.query(insertSQL, values);
        insertedCount += batch.length;

        console.log(`  ✓ Batch ${Math.ceil((i + batchSize) / batchSize)}: ${insertedCount} rows inserted`);
      }

      console.log(`✅ Total: ${insertedCount} rows inserted into "${tableName}"`);
      return insertedCount;
    } catch (error) {
      console.error(`❌ Batch insert failed for "${tableName}":`, error);
      throw error;
    }
  }

  /**
   * Get row count from table
   */
  async getRowCount(tableName: string): Promise<number> {
    if (!this.pool) throw new Error("Pool not initialized");

    try {
      const result = await this.pool.query(`SELECT COUNT(*) FROM "${tableName}"`);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      console.error(`❌ Failed to get row count for "${tableName}":`, error);
      throw error;
    }
  }

  /**
   * Query table data
   */
  async queryTable(tableName: string, limit: number = 100): Promise<Record<string, any>[]> {
    if (!this.pool) throw new Error("Pool not initialized");

    try {
      const result = await this.pool.query(`SELECT * FROM "${tableName}" LIMIT $1`, [limit]);
      return result.rows;
    } catch (error) {
      console.error(`❌ Failed to query "${tableName}":`, error);
      throw error;
    }
  }

  /**
   * Drop table
   */
  async dropTable(tableName: string): Promise<void> {
    if (!this.pool) throw new Error("Pool not initialized");

    try {
      await this.pool.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
      console.log(`✅ Table "${tableName}" dropped`);
    } catch (error) {
      console.error(`❌ Failed to drop table "${tableName}":`, error);
      throw error;
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      console.log("✅ PostgreSQL connection closed");
    }
  }

  /**
   * Get pool instance
   */
  getPool(): Pool {
    if (!this.pool) throw new Error("Pool not initialized");
    return this.pool;
  }
}

/**
 * Parse PostgreSQL connection string
 */
export function parsePostgresUrl(url: string): PostgresConfig {
  try {
    const urlObj = new URL(url);
    return {
      host: urlObj.hostname,
      port: parseInt(urlObj.port || "5432", 10),
      database: urlObj.pathname.slice(1),
      user: urlObj.username,
      password: urlObj.password,
      ssl: urlObj.searchParams.get("ssl") === "true",
    };
  } catch (error) {
    throw new Error(`Invalid PostgreSQL URL: ${error}`);
  }
}

/**
 * Create PostgreSQL service from environment variable
 */
export async function createPostgresService(): Promise<PostgresService> {
  const postgresUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!postgresUrl) {
    throw new Error("DATABASE_URL or POSTGRES_URL environment variable not set");
  }

  const config = parsePostgresUrl(postgresUrl);
  const service = new PostgresService(config);
  await service.initialize();

  return service;
}

export default PostgresService;
