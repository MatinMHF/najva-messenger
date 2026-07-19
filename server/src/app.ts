import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { apiLimiter } from './middleware/rateLimit';
import routes from './routes';

export function createApp(): express.Express {
  const app = express();

  // Behind nginx (single reverse-proxy hop): trust exactly one X-Forwarded-For
  // entry so express-rate-limit keys on the real client IP instead of nginx's,
  // and stops throwing ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on every proxied
  // request. `1` (not `true`) prevents clients from spoofing the header.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({
    origin: config.corsOrigin,
    credentials: true
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());
  app.use(apiLimiter);

  app.use('/api', routes);

  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err);
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      status: 'error',
      message: err.message || 'Internal Server Error'
    });
  });

  return app;
}
