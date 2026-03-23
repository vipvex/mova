import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { registerRoutes } from "../server/routes";
import { ensureMediaDirectory, getMediaDirectory } from "../server/media";

const app = express();

ensureMediaDirectory();
app.use('/media/images', express.static(getMediaDirectory()));

app.use(
  express.json({
    limit: '10mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

const httpServer = createServer(app);

let initialized = false;
const initPromise = (async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
  });

  initialized = true;
})();

export default async function handler(req: any, res: any) {
  if (!initialized) {
    await initPromise;
  }
  app(req, res);
}
