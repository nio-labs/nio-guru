import { Hono } from 'hono';
import { getAvailableModels } from '../services/nio-runner.js';

const router = new Hono();

router.get('/', async (c) => {
  const models = await getAvailableModels();
  return c.json({ models });
});

export default router;
