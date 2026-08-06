import { fileURLToPath } from "node:url";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createMcpConnectionManager } from "./mcpConnectionManager.js";

const MCP_SERVER_PATH = fileURLToPath(new URL("./mcpServer.js", import.meta.url));

async function createConnection() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [MCP_SERVER_PATH],
    env: { ...process.env },
    stderr: "pipe",
  });
  const client = new McpClient({ name: "genkit-service", version: "1.0.0" });

  return {
    async connect() {
      await client.connect(transport);
      transport.stderr?.resume();
    },
    setOnClose(handler) {
      client.onclose = handler;
    },
    callTool(request) {
      return client.callTool(request);
    },
    close() {
      return client.close();
    },
  };
}

const connectionManager = createMcpConnectionManager(createConnection);

export async function callMcpTool(name, authToken) {
  const connection = await connectionManager.getConnection();
  try {
    return await connection.callTool({ name, arguments: { authToken } });
  } catch (error) {
    connectionManager.invalidate(connection);
    await connection.close().catch(() => {});
    throw error;
  }
}

export function closeMcpClient() {
  return connectionManager.close();
}
