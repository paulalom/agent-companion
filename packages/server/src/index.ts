import cors from "cors";
import express from "express";
import { loadMcpServersConfig } from "./config.js";
import { getUsageSnapshot } from "./mcp.js";

const port = Number(process.env.PORT ?? 4167);
const app = express();

app.use(cors());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "agent-companion", at: new Date().toISOString() });
});

app.get("/api/sources", (_req, res) => {
  const config = loadMcpServersConfig();
  res.json({
    sources: config.servers.map(({ id, name, kind }) => ({ id, name, kind }))
  });
});

app.get("/api/usage", async (_req, res) => {
  const config = loadMcpServersConfig();
  const snapshots = await Promise.all(config.servers.map((server) => getUsageSnapshot(server)));
  res.json({
    snapshots,
    capturedAt: new Date().toISOString()
  });
});

app.listen(port, () => {
  console.log(`Agent Companion API listening on http://localhost:${port}`);
});
