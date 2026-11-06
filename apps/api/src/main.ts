import { SwaggerModule } from '@nestjs/swagger';
import { createApp, buildOpenApi } from './bootstrap';
import { config } from './config';

async function main() {
  const app = await createApp();
  SwaggerModule.setup('docs', app, buildOpenApi(app));
  await app.listen(config().API_PORT);
  console.info(`COLLABIZ API listening on :${config().API_PORT} (OpenAPI at /docs)`);
}
main();
