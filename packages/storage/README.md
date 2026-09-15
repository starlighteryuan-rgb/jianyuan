# @jianyuan/storage

Storage adapters that implement `@jianyuan/core/contracts` live here.

- `memory/` is the Phase 3.2 in-process adapter and test implementation.
- `sqlite/` is the Phase 4 local-first adapter with migrations, transactions,
  logical export/restore and restart persistence tests.

The existing Prisma and `src/infra/memory` implementations remain untouched
until their callers are migrated separately.
