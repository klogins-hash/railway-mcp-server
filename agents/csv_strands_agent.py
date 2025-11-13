#!/usr/bin/env python3
"""
Strands Agent with CSV Processing Capabilities
Connects to the Railway MCP CSV server and provides autonomous CSV processing
"""

import os
import sys
from typing import Optional, Any
from dotenv import load_dotenv
import json
import asyncio

# Strands Agents imports
from strands_agents import Agent, Model
from strands_agents.tools.mcp import MCPClient
from mcp.client.sse import sse_client

# Load environment variables
load_dotenv()

class CSVStrandsAgent:
    """Autonomous Strands agent for CSV processing with MCP integration"""

    def __init__(self, mcp_url: str, api_key: str, model_id: str = "gpt-4"):
        """
        Initialize the CSV Strands Agent

        Args:
            mcp_url: URL to the MCP server (e.g., http://localhost:3000/sse)
            api_key: API key for authentication
            model_id: Model ID to use (default: gpt-4)
        """
        self.mcp_url = mcp_url
        self.api_key = api_key
        self.model_id = model_id
        self.agent: Optional[Agent] = None
        self.mcp_client: Optional[MCPClient] = None

    async def initialize(self) -> None:
        """Initialize the agent with MCP tools"""
        print(f"🔌 Connecting to MCP server at {self.mcp_url}...")

        # Create MCP client for SSE transport
        self.mcp_client = MCPClient(
            lambda: sse_client(
                self.mcp_url,
                headers={"X-API-Key": self.api_key}
            )
        )

        try:
            # List available tools
            print("📋 Discovering MCP tools...")
            tools = await self._get_tools()

            if not tools:
                print("⚠️  No tools found on MCP server")
                return

            print(f"✅ Found {len(tools)} tools:")
            for tool in tools:
                print(f"   - {tool.name}: {tool.description}")

            # Create model
            model = Model(id=self.model_id)

            # Initialize agent with tools and model
            self.agent = Agent(
                name="CSV Processor Agent",
                model=model,
                tools=tools,
                instructions=self._get_system_prompt()
            )

            print(f"✅ Agent initialized successfully: {self.agent.name}")

        except Exception as e:
            print(f"❌ Error initializing agent: {e}")
            raise

    async def _get_tools(self):
        """Get tools from MCP server"""
        if not self.mcp_client:
            raise RuntimeError("MCP client not initialized")

        # Use the managed approach with async context
        from contextlib import asynccontextmanager

        @asynccontextmanager
        async def get_tools_context():
            yield self.mcp_client.list_tools_sync()

        async with get_tools_context() as tools:
            return tools if tools else []

    def _get_system_prompt(self) -> str:
        """Get the system prompt for the agent"""
        return """You are an autonomous CSV Processing Agent powered by Strands.

Your capabilities include:
1. Uploading and processing CSV files
2. Querying imported data from PostgreSQL tables
3. Getting statistics and metadata about processed datasets
4. Tracking the status of CSV processing jobs
5. Managing and cleaning up completed jobs

When processing CSV files:
- Always validate the CSV format before importing
- infer column types automatically
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
- Suggest next steps after operations"""

    async def process_csv(self, file_path: str, table_name: Optional[str] = None) -> str:
        """
        Process a CSV file autonomously

        Args:
            file_path: Path to the CSV file
            table_name: Optional custom table name

        Returns:
            Processing result and job information
        """
        if not self.agent:
            raise RuntimeError("Agent not initialized. Call initialize() first.")

        if not os.path.exists(file_path):
            return f"❌ File not found: {file_path}"

        prompt = f"Process the CSV file at {file_path}"
        if table_name:
            prompt += f" and import it to a table called {table_name}"
        prompt += ". Provide details about the import including job ID, row count, and status."

        print(f"\n🔄 Processing: {prompt}")
        response = await self.agent.run(prompt)
        return response

    async def query_table(self, table_name: str, limit: int = 100) -> str:
        """
        Query a table autonomously

        Args:
            table_name: Name of the table to query
            limit: Maximum rows to return

        Returns:
            Query results
        """
        if not self.agent:
            raise RuntimeError("Agent not initialized. Call initialize() first.")

        prompt = f"Query the {table_name} table and show me the first {limit} rows with statistics."
        print(f"\n📊 Querying: {prompt}")
        response = await self.agent.run(prompt)
        return response

    async def get_job_status(self, job_id: str) -> str:
        """
        Get the status of a CSV processing job

        Args:
            job_id: The job ID to check

        Returns:
            Job status information
        """
        if not self.agent:
            raise RuntimeError("Agent not initialized. Call initialize() first.")

        prompt = f"Check the status of CSV processing job {job_id} and provide details."
        print(f"\n⏱️  Checking job: {prompt}")
        response = await self.agent.run(prompt)
        return response

    async def list_jobs(self) -> str:
        """
        List all active CSV processing jobs

        Returns:
            List of jobs
        """
        if not self.agent:
            raise RuntimeError("Agent not initialized. Call initialize() first.")

        prompt = "List all active CSV processing jobs and their current status."
        print(f"\n📝 Listing jobs: {prompt}")
        response = await self.agent.run(prompt)
        return response

    async def analyze_data(self, table_name: str) -> str:
        """
        Perform autonomous analysis on imported data

        Args:
            table_name: Table to analyze

        Returns:
            Analysis results
        """
        if not self.agent:
            raise RuntimeError("Agent not initialized. Call initialize() first.")

        prompt = f"""Analyze the {table_name} table and provide:
        1. Basic statistics (row count, column count)
        2. Data type breakdown
        3. Sample data (first 5 rows)
        4. Any notable patterns or insights
        5. Recommendations for data usage"""

        print(f"\n🔍 Analyzing: {table_name}")
        response = await self.agent.run(prompt)
        return response

    async def cleanup_job(self, job_id: str) -> str:
        """
        Clean up a completed job

        Args:
            job_id: Job ID to clean up

        Returns:
            Cleanup status
        """
        if not self.agent:
            raise RuntimeError("Agent not initialized. Call initialize() first.")

        prompt = f"Clean up and remove cached data for job {job_id}."
        print(f"\n🗑️  Cleaning up: {prompt}")
        response = await self.agent.run(prompt)
        return response


async def main():
    """Main entry point for the Strands CSV agent"""

    # Get configuration from environment
    mcp_url = os.getenv("MCP_SERVER_URL", "http://localhost:3000/sse")
    api_key = os.getenv("API_KEY", "change-me-in-production")

    print("=" * 60)
    print("🤖 CSV Strands Agent - Autonomous CSV Processing")
    print("=" * 60)

    # Initialize agent
    agent = CSVStrandsAgent(mcp_url=mcp_url, api_key=api_key)

    try:
        await agent.initialize()

        # Example operations
        print("\n" + "=" * 60)
        print("📚 Example: List active jobs")
        print("=" * 60)
        result = await agent.list_jobs()
        print(result)

        # Interactive mode
        print("\n" + "=" * 60)
        print("🔄 Interactive Mode - Type your CSV processing requests")
        print("Commands:")
        print("  analyze <table>  - Analyze a table")
        print("  query <table>    - Query a table")
        print("  status <job_id>  - Check job status")
        print("  list             - List all jobs")
        print("  exit             - Exit the agent")
        print("=" * 60)

        while True:
            try:
                user_input = input("\n> ").strip()

                if not user_input:
                    continue

                if user_input.lower() == "exit":
                    print("👋 Goodbye!")
                    break

                if user_input.lower() == "list":
                    result = await agent.list_jobs()
                    print(result)
                elif user_input.lower().startswith("status "):
                    job_id = user_input[7:].strip()
                    result = await agent.get_job_status(job_id)
                    print(result)
                elif user_input.lower().startswith("query "):
                    table_name = user_input[6:].strip()
                    result = await agent.query_table(table_name)
                    print(result)
                elif user_input.lower().startswith("analyze "):
                    table_name = user_input[8:].strip()
                    result = await agent.analyze_data(table_name)
                    print(result)
                else:
                    # Treat as generic prompt
                    if not agent.agent:
                        print("❌ Agent not initialized")
                        continue

                    response = await agent.agent.run(user_input)
                    print(response)

            except KeyboardInterrupt:
                print("\n👋 Interrupted by user")
                break
            except Exception as e:
                print(f"❌ Error: {e}")

    except Exception as e:
        print(f"❌ Agent initialization failed: {e}")
        print("Make sure the MCP server is running and accessible")
        sys.exit(1)


if __name__ == "__main__":
    print("🚀 Starting Strands CSV Agent...\n")
    asyncio.run(main())
