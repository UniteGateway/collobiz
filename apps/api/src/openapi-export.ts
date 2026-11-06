import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, buildOpenApi } from './bootstrap';

(async () => {
  const app = await createApp({ logger: false });
  await app.init();
  const doc = buildOpenApi(app);
  const out = join(__dirname, '..', '..', '..', 'docs', 'api');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'openapi.json'), JSON.stringify(doc, null, 2));
  console.info(`OpenAPI written: ${Object.keys(doc.paths).length} paths`);
  await app.close();
})();
