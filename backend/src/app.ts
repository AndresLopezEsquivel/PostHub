import express from 'express';
import routes from './routes';
import { sessionMiddleware } from './config/session';
import { env } from './config/env';
import { notFoundHandler } from './middleware/notFoundHandler';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// Behind the frontend's same-origin proxy in production; trust it so Express
// sees the original protocol and the `secure` cookie is actually sent over HTTPS.
if (env.nodeEnv === 'production') {
  app.set('trust proxy', 1);
}

app.use(express.json());
app.use(sessionMiddleware);
app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
