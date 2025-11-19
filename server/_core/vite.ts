import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer, type InlineConfig } from "vite";

const frontendRoot = path.resolve(import.meta.dirname, "..", "..", "..", "egp-frontend");
const frontendIndexHtml = path.resolve(frontendRoot, "index.html");
const frontendDist = path.resolve(frontendRoot, "dist");
const frontendConfigPath = path.resolve(frontendRoot, "vite.config.ts");

async function loadFrontendViteConfig(): Promise<InlineConfig | undefined> {
  if (!fs.existsSync(frontendConfigPath)) {
    return undefined;
  }
  try {
    const loaded = await import(frontendConfigPath);
    return (loaded.default || loaded) as InlineConfig;
  } catch (error) {
    console.warn("[Vite] Failed to load frontend config, using defaults.", error);
    return undefined;
  }
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const sharedViteConfig = await loadFrontendViteConfig();
  const vite = await createViteServer({
    ...(sharedViteConfig ?? {}),
    root: sharedViteConfig?.root ?? frontendRoot,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      // always reload the index.html file from disk in case it changes
      let template = await fs.promises.readFile(frontendIndexHtml, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  if (!fs.existsSync(frontendDist)) {
    console.error(
      `Could not find the build directory: ${frontendDist}, make sure to build the client first`
    );
  }

  app.use(express.static(frontendDist));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(frontendDist, "index.html"));
  });
}
