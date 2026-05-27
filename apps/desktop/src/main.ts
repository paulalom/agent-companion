import { app, BrowserWindow, shell } from "electron";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type StartedServer = {
  baseUrl: string;
  close: () => Promise<void>;
};

let mainWindow: BrowserWindow | null = null;
let apiServer: StartedServer | null = null;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function projectRoot() {
  if (app.isPackaged) {
    return app.getAppPath();
  }
  return path.resolve(__dirname, "../../..");
}

function resourcesRoot() {
  return app.isPackaged ? process.resourcesPath : projectRoot();
}

async function startApiServer() {
  const root = projectRoot();
  const resources = resourcesRoot();

  process.env.AGENT_COMPANION_RESOURCES_PATH = resources;
  process.env.AGENT_COMPANION_NODE_RUNTIME = process.execPath;
  process.env.AGENT_COMPANION_MCP_CONFIG = app.isPackaged
    ? path.join(resources, "config", "mcp-servers.desktop.json")
    : path.join(root, "config", "mcp-servers.json");

  const serverModulePath = path.join(root, "packages", "server", "dist", "app.js");
  const serverModule = (await import(pathToFileURL(serverModulePath).href)) as {
    startAgentCompanionServer: (options: { configRoot: string; port: number }) => Promise<StartedServer>;
  };

  return serverModule.startAgentCompanionServer({ configRoot: root, port: 0 });
}

async function createWindow() {
  apiServer = await startApiServer();

  mainWindow = new BrowserWindow({
    backgroundColor: "#111315",
    height: 760,
    minHeight: 560,
    minWidth: 900,
    show: false,
    title: "Agent Companion",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    width: 1180
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  const uiPath = path.join(projectRoot(), "apps", "dashboard", "dist", "index.html");
  await mainWindow.loadFile(uiPath, {
    query: {
      api: apiServer.baseUrl
    }
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void apiServer?.close();
});

app.whenReady().then(async () => {
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});
