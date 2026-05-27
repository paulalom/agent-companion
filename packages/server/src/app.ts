import type { Server } from "node:http";
import cors from "cors";
import express from "express";
import type { Express } from "express";
import { loadMcpServersConfig } from "./config.js";
import { getUsageSnapshots } from "./mcp.js";
import { withPricingEstimate } from "./pricing.js";

export type AgentCompanionAppOptions = {
  configRoot?: string;
};

export type StartServerOptions = AgentCompanionAppOptions & {
  host?: string;
  port?: number;
};

export type StartedServer = {
  app: Express;
  baseUrl: string;
  host: string;
  port: number;
  server: Server;
  close: () => Promise<void>;
};

export function createAgentCompanionApp(options: AgentCompanionAppOptions = {}) {
  const app = express();

  app.use(cors());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "agent-companion", at: new Date().toISOString() });
  });

  app.get("/api/sources", (_req, res) => {
    const config = loadMcpServersConfig(options.configRoot);
    res.json({
      sources: config.servers.map(({ id, name, kind }) => ({ id, name, kind }))
    });
  });

  app.get("/api/usage", async (_req, res) => {
    const config = loadMcpServersConfig(options.configRoot);
    const snapshotsByServer = await Promise.all(config.servers.map((server) => getUsageSnapshots(server)));
    const snapshots = snapshotsByServer.flat().map(withPricingEstimate);
    res.json({
      snapshots,
      capturedAt: new Date().toISOString()
    });
  });

  return app;
}

export async function startAgentCompanionServer(
  options: StartServerOptions = {}
): Promise<StartedServer> {
  const host = options.host ?? "127.0.0.1";
  const requestedPort = options.port ?? 4167;
  const app = createAgentCompanionApp(options);

  const server = await new Promise<Server>((resolve, reject) => {
    const pending = app.listen(requestedPort, host, () => {
      pending.off("error", reject);
      resolve(pending);
    });
    pending.on("error", reject);
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : requestedPort;

  return {
    app,
    baseUrl: `http://${host}:${port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
    host,
    port,
    server
  };
}
