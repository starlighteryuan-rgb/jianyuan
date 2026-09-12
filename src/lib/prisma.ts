import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../generated/prisma/client';

/**
 * PrismaClient singleton (Prisma 7).
 *
 * Two Prisma 7 changes are reflected here:
 *   - `PrismaClient` is imported from the GENERATED output, not `@prisma/client`.
 *   - A driver adapter is REQUIRED for a direct database connection; the
 *     connection URL no longer lives in schema.prisma (see prisma.config.ts).
 *
 * Construction is LAZY. Phase 1 (Foundation) defines schema and pure domain
 * logic and never touches a database, so importing this module must not
 * require `DATABASE_URL` to be present or a server to be reachable. The client
 * is built on first actual use, in Phase 2.
 *
 * This adapter lives in the infrastructure layer by design: the domain core
 * depends only on the repository ports in src/domain/ports, never on Prisma
 * (docs/architecture.md §1, §5).
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const createClient = (): PrismaClient => {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and provide a ' +
        'PostgreSQL connection string before using the database.',
    );
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
};

/** Returns the process-wide client, creating it on first use. */
export const getPrisma = (): PrismaClient => {
  const existing = globalForPrisma.prisma;
  if (existing) return existing;

  const client = createClient();

  // Avoid exhausting connections across dev hot-reloads.
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = client;
  }

  return client;
};
