import express from 'express';
import routes from './routes';
import { notFoundHandler } from './middleware/notFoundHandler';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(express.json());
app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
