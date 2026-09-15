# @jianyuan/core

The platform-neutral Shared Core for Jianyuan Personal Awareness.

Public seams are exported from the package root and from four explicit
subpaths: `domain`, `application`, `contracts`, and `events`. Consumers must not
import package-internal files.

The package contains no Next.js, React, Prisma, PostgreSQL, AI SDK, Zhihu, file
system, network, or environment-variable dependency. Storage and provider
adapters depend on Core contracts and are supplied by an app composition root.

The existing `src/domain`, `src/application`, and `packages/core-spike` remain
in place during Phase 3.1. No Web route is wired to this package yet.
