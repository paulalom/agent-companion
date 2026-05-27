import { startAgentCompanionServer } from "./app.js";

const port = Number(process.env.PORT ?? 4167);
const started = await startAgentCompanionServer({ port });

console.log(`Agent Companion API listening on ${started.baseUrl}`);
