# @jianyuan/storage-sqlite

File-backed local-first adapter implementing `CoreStoragePorts` with Node's
built-in `node:sqlite` driver. Schema migrations, transactions, search,
logical JSON export/restore, and connection lifecycle stay inside this package.

The default database is not encrypted. `SqliteEncryptionController` is the
explicit extension seam for a future runtime-verified SQLCipher or device-key
implementation; no device-level encryption is claimed in Phase 4.
