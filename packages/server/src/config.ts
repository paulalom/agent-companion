import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";
import type { McpServerConfig, McpServersConfig } from "./types.js";

const serverConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  usageTool: z.string().min(1).optional()
});

const serversConfigSchema = z.object({
  servers: z.array(serverConfigSchema)
});

export function findWorkspaceRoot(start = process.cwd()) {
  let current = path.resolve(start);
  while (true) {
    const packagePath = path.join(current, "package.json");
    if (existsSync(packagePath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
          name?: unknown;
          workspaces?: unknown;
        };
        if (packageJson.name === "agent-companion" || Array.isArray(packageJson.workspaces)) {
          return current;
        }
      } catch {
        // Keep walking.
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(start);
    }
    current = parent;
  }
}

export function loadMcpServersConfig(rootDir = findWorkspaceRoot()): McpServersConfig {
  const configPath =
    process.env.AGENT_COMPANION_MCP_CONFIG ??
    process.env.PAULALOM_MCP_CONFIG ??
    path.join(rootDir, "config", "mcp-servers.json");
  const parsed = serversConfigSchema.parse(JSON.parse(readFileSync(configPath, "utf8")));
  return {
    servers: parsed.servers.map((server) => expandServerConfig(server, rootDir))
  };
}

function expandServerConfig(server: McpServerConfig, rootDir: string): McpServerConfig {
  return {
    ...server,
    command: expandTokens(server.command, rootDir),
    args: server.args?.map((arg) => expandTokens(arg, rootDir)),
    env: server.env ? expandEnv(server.env, rootDir) : undefined
  };
}

function expandEnv(env: Record<string, string>, rootDir: string) {
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => [key, expandTokens(value, rootDir)])
  );
}

function expandTokens(value: string, rootDir: string) {
  return value
    .replaceAll("${workspaceRoot}", rootDir)
    .replaceAll("${home}", homedir())
    .replaceAll("${resources}", process.env.AGENT_COMPANION_RESOURCES_PATH ?? rootDir)
    .replaceAll("${nodeRuntime}", process.env.AGENT_COMPANION_NODE_RUNTIME ?? "node");
}
