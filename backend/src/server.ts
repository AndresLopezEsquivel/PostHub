import app from './app';
import { env } from './config/env';

app.listen(env.port, () => {
  console.log(`PostHub API listening on port ${env.port}`);
});
