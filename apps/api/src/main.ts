import { SwaggerModule } from '@nestjs/swagger';
import { createApp, buildOpenApi } from './bootstrap';
import { config } from './config';

async function main() {
  const app = await createApp();
  const docs = config().EXPOSE_API_DOCS ?? config().NODE_ENV !== 'production';
  if (docs) SwaggerModule.setup('docs', app, buildOpenApi(app));
  await app.listen(config().API_PORT);
  console.info(`COLLABIZ API listening on :${config().API_PORT} ${docs ? '(OpenAPI at /docs)' : '(OpenAPI UI disabled)'}`);
}
main();
