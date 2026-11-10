/** Seeds demo users and the default UNITE 40 MW project. Passwords come from env or a documented demo default. */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { DEFAULT_PLANT, DEFAULT_PRICES } from '@unite/power-engine';

const db = new PrismaClient();
async function main() {
  const pw = await bcrypt.hash(process.env.POWER_DEMO_PASSWORD ?? 'UnitePower#2026', 12);
  for (const [email, name, role] of [['admin@unitepower.example', 'Power Admin', 'admin'], ['analyst@unitepower.example', 'Energy Analyst', 'analyst'], ['viewer@unitepower.example', 'Board Viewer', 'viewer']] as const) {
    await db.user.upsert({ where: { email }, update: {}, create: { email, name, role, passwordHash: pw } });
  }
  if (!(await db.project.count())) await db.project.create({ data: { name: DEFAULT_PLANT.site.name, config: DEFAULT_PLANT as never, prices: DEFAULT_PRICES as never } });
  console.log('Seeded users (admin/analyst/viewer @unitepower.example) and the default project');
}
main().finally(() => db.$disconnect());
