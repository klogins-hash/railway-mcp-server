/**
 * Valkey (Redis) Integration Module
 * Handles caching and CSV processing orchestration
 */

import { createClient, RedisClientType } from "redis";

export interface ValkeyConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
}

export interface CSVProcessingJob {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  fileName: string;
  tableName: string;
  rowCount: number;
  processedRows: number;
  uploadedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export class ValkeyService {
  private client: RedisClientType | null = null;
  private config: ValkeyConfig;
  private keyPrefix: string;

  constructor(config: ValkeyConfig) {
    this.config = config;
    this.keyPrefix = config.keyPrefix || "csv:";
  }

  /**
   * Initialize Valkey connection
   */
  async initialize(): Promise<void> {
    try {
      this.client = createClient({
        socket: {
          host: this.config.host,
          port: this.config.port,
        },
        password: this.config.password,
      } as any);

      this.client.on("error", (error: any) => console.error("Valkey error:", error));

      await this.client.connect();
      const pong = await this.client.ping();
      console.log("✅ Valkey connected:", pong);
    } catch (error) {
      console.error("❌ Valkey connection failed:", error);
      throw error;
    }
  }

  /**
   * Store CSV processing job
   */
  async storeJob(job: CSVProcessingJob): Promise<void> {
    if (!this.client) throw new Error("Valkey not initialized");

    const key = `${this.keyPrefix}job:${job.id}`;
    const ttl = 86400; // 24 hours

    try {
      await this.client.setEx(
        key,
        ttl,
        JSON.stringify(job)
      );
      console.log(`✅ Job ${job.id} stored in Valkey`);
    } catch (error) {
      console.error(`❌ Failed to store job ${job.id}:`, error);
      throw error;
    }
  }

  /**
   * Get CSV processing job
   */
  async getJob(jobId: string): Promise<CSVProcessingJob | null> {
    if (!this.client) throw new Error("Valkey not initialized");

    const key = `${this.keyPrefix}job:${jobId}`;

    try {
      const data = await this.client.get(key);
      if (!data) return null;
      return JSON.parse(data) as CSVProcessingJob;
    } catch (error) {
      console.error(`❌ Failed to get job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Update job status
   */
  async updateJobStatus(
    jobId: string,
    status: CSVProcessingJob["status"],
    updates?: Partial<CSVProcessingJob>
  ): Promise<void> {
    if (!this.client) throw new Error("Valkey not initialized");

    const job = await this.getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const updatedJob = {
      ...job,
      status,
      ...updates,
    };

    await this.storeJob(updatedJob);
    console.log(`✅ Job ${jobId} status updated to ${status}`);
  }

  /**
   * Cache parsed CSV data
   */
  async cacheCSVData(jobId: string, data: Record<string, any>[]): Promise<void> {
    if (!this.client) throw new Error("Valkey not initialized");

    const key = `${this.keyPrefix}data:${jobId}`;
    const ttl = 86400; // 24 hours

    try {
      // Store in chunks to handle large datasets
      const chunkSize = 100;
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        const chunkKey = `${key}:chunk:${Math.floor(i / chunkSize)}`;
        await this.client.setEx(
          chunkKey,
          ttl,
          JSON.stringify(chunk)
        );
      }

      // Store metadata
      await this.client.setEx(
        `${key}:metadata`,
        ttl,
        JSON.stringify({
          totalRows: data.length,
          chunks: Math.ceil(data.length / chunkSize),
        })
      );

      console.log(`✅ CSV data (${data.length} rows) cached for job ${jobId}`);
    } catch (error) {
      console.error(`❌ Failed to cache CSV data for job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Get cached CSV data
   */
  async getCSVData(jobId: string): Promise<Record<string, any>[]> {
    if (!this.client) throw new Error("Valkey not initialized");

    const key = `${this.keyPrefix}data:${jobId}`;

    try {
      // Get metadata
      const metadataStr = await this.client.get(`${key}:metadata`);
      if (!metadataStr) {
        console.warn(`No cached data found for job ${jobId}`);
        return [];
      }

      const metadata = JSON.parse(metadataStr);
      const data: Record<string, any>[] = [];

      // Retrieve all chunks
      for (let i = 0; i < metadata.chunks; i++) {
        const chunkKey = `${key}:chunk:${i}`;
        const chunkStr = await this.client.get(chunkKey);
        if (chunkStr) {
          const chunk = JSON.parse(chunkStr);
          data.push(...chunk);
        }
      }

      console.log(`✅ Retrieved ${data.length} rows from cache for job ${jobId}`);
      return data;
    } catch (error) {
      console.error(`❌ Failed to get cached CSV data for job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Store CSV metadata
   */
  async storeMetadata(key: string, metadata: Record<string, any>): Promise<void> {
    if (!this.client) throw new Error("Valkey not initialized");

    const ttl = 86400; // 24 hours

    try {
      await this.client.setEx(
        `${this.keyPrefix}meta:${key}`,
        ttl,
        JSON.stringify(metadata)
      );
      console.log(`✅ Metadata for ${key} stored`);
    } catch (error) {
      console.error(`❌ Failed to store metadata for ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get CSV metadata
   */
  async getMetadata(key: string): Promise<Record<string, any> | null> {
    if (!this.client) throw new Error("Valkey not initialized");

    try {
      const data = await this.client.get(`${this.keyPrefix}meta:${key}`);
      if (!data) return null;
      return JSON.parse(data);
    } catch (error) {
      console.error(`❌ Failed to get metadata for ${key}:`, error);
      throw error;
    }
  }

  /**
   * List all active jobs
   */
  async listJobs(): Promise<CSVProcessingJob[]> {
    if (!this.client) throw new Error("Valkey not initialized");

    try {
      const keys = await this.client.keys(`${this.keyPrefix}job:*`);
      const jobs: CSVProcessingJob[] = [];

      for (const key of keys) {
        const data = await this.client.get(key);
        if (data) {
          jobs.push(JSON.parse(data) as CSVProcessingJob);
        }
      }

      return jobs;
    } catch (error) {
      console.error("❌ Failed to list jobs:", error);
      throw error;
    }
  }

  /**
   * Clear job and associated data
   */
  async clearJob(jobId: string): Promise<void> {
    if (!this.client) throw new Error("Valkey not initialized");

    try {
      const pattern = `${this.keyPrefix}*:${jobId}`;
      const keys = await this.client.keys(pattern);

      if (keys.length > 0) {
        await this.client.del(keys);
        console.log(`✅ Cleared ${keys.length} keys for job ${jobId}`);
      }
    } catch (error) {
      console.error(`❌ Failed to clear job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Set processing queue
   */
  async enqueueJob(jobId: string): Promise<void> {
    if (!this.client) throw new Error("Valkey not initialized");

    try {
      await this.client.rPush(`${this.keyPrefix}queue`, jobId);
      console.log(`✅ Job ${jobId} enqueued`);
    } catch (error) {
      console.error(`❌ Failed to enqueue job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Dequeue job from processing queue
   */
  async dequeueJob(): Promise<string | null> {
    if (!this.client) throw new Error("Valkey not initialized");

    try {
      const jobId = await this.client.lPop(`${this.keyPrefix}queue`);
      if (jobId) console.log(`✅ Job ${jobId} dequeued`);
      return jobId;
    } catch (error) {
      console.error("❌ Failed to dequeue job:", error);
      throw error;
    }
  }

  /**
   * Get queue length
   */
  async getQueueLength(): Promise<number> {
    if (!this.client) throw new Error("Valkey not initialized");

    try {
      return await this.client.lLen(`${this.keyPrefix}queue`);
    } catch (error) {
      console.error("❌ Failed to get queue length:", error);
      throw error;
    }
  }

  /**
   * Close Valkey connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
      console.log("✅ Valkey connection closed");
    }
  }

  /**
   * Get client instance
   */
  getClient(): RedisClientType {
    if (!this.client) throw new Error("Valkey not initialized");
    return this.client;
  }
}

/**
 * Parse Valkey connection string (Redis URL format)
 */
export function parseValkeyUrl(url: string): ValkeyConfig {
  try {
    const urlObj = new URL(url);
    return {
      host: urlObj.hostname,
      port: parseInt(urlObj.port || "6379", 10),
      password: urlObj.password || undefined,
      db: urlObj.pathname ? parseInt(urlObj.pathname.slice(1), 10) : 0,
    };
  } catch (error) {
    throw new Error(`Invalid Valkey URL: ${error}`);
  }
}

/**
 * Create Valkey service from environment variable
 */
export async function createValkeyService(): Promise<ValkeyService> {
  const valkeyUrl = process.env.VALKEY_URL || process.env.REDIS_URL;

  if (!valkeyUrl) {
    throw new Error("VALKEY_URL or REDIS_URL environment variable not set");
  }

  const config = parseValkeyUrl(valkeyUrl);
  const service = new ValkeyService(config);
  await service.initialize();

  return service;
}

export default ValkeyService;
