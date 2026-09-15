# @jianyuan/storage-memory

In-process storage adapter for `@jianyuan/core` contracts. It implements every
Core repository port and the atomic ingestion commit port without importing
Prisma, Next.js, React, database clients, network clients, or provider SDKs.

`MemoryStorageAdapter` owns repository instances and exposes them through the
`CoreStoragePorts` interface. Application modules still receive only the narrow
ports each use case requires.
