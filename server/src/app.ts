import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { apiLimiter } from './middleware/rateLimit';
import routes from './routes';

export function createApp(): express.Express {
  const app = express();

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
