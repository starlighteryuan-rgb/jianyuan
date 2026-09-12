import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 configuration.
 *
 * The datasource connection URL is no longer permitted in schema.prisma; it
 * lives here and is read from the environment. `DATABASE_URL` is intentionally
 * NOT committed — see .env.example for the expected shape.
 *
 * Phase 1 does not connect to a database. This config exists so that
 * `prisma validate` and `prisma generate` operate on the schema; applying
 * migrations is Phase 2 work.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
