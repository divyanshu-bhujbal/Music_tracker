# E02-T05 Review Fixes

## C1 (Critical): `execute()` ignores `params` — use `run()` for parameterized DML

### Root Cause

`CapacitorSqliteConnection.ts:240` always calls `dbConn.execute(sql, false)`. The Capacitor plugin's `execute()` does not accept a params array — it only takes `(sql: string, transaction?: boolean)`. The `run()` method is the correct API: `run(statement: string, values?: any[], transaction?: boolean)`.

### Fix: `packages/platform/src/capacitor/CapacitorSqliteConnection.ts`

In the `execute()` method, replace the call from `dbConn.execute(sql, false)` to a conditional that uses `run()` when params are present.

**Current (line 240):**
```ts
await this.dbConn!.execute(sql, false);
```

**Replace with:**
```ts
if (params && params.length > 0) {
  await this.dbConn!.run(sql, params, false);
} else {
  await this.dbConn!.execute(sql, false);
}
```

Also add the `PluginExecResult` interface (fix for m1):

### Fix: Add `PluginExecResult` interface

After the existing `PluginQueryResult` interface (line 8), add:

```ts
interface PluginExecResult {
  changes?: { changes?: number; lastId?: number };
}
```

---

## M1 (Major): Test mock needs `run()` method

### Fix: `packages/platform/src/capacitor/__tests__/CapacitorSqliteConnection.test.ts`

**1. Add `run` to the mock factory (line 5 area):**

After `execute:` line, add:
```ts
run: jest.fn().mockResolvedValue({ changes: { changes: 0 } }),
```

**2. Update the `beforeEach` reset block (after line 64):**

After `mockDbConn.execute.mockResolvedValue(...)`, add:
```ts
mockDbConn.run.mockResolvedValue({ changes: { changes: 0 } });
```

**3. Update `MockDbConn` interface (after line 33):**

Add:
```ts
run: jest.Mock;
```

**4. Update INSERT test (lines 258-269):**

Change assertion from `mockDbConn.execute` to `mockDbConn.run`, and verify both SQL and params are forwarded:

```ts
it('INSERT with params uses run() with explicit transaction:false', async () => {
  mockDbConn.run.mockResolvedValueOnce({
    changes: { changes: 1 },
  });

  await conn.execute("INSERT INTO t (val) VALUES (?)", ['hello']);

  expect(mockDbConn.run).toHaveBeenCalledWith(
    "INSERT INTO t (val) VALUES (?)",
    ['hello'],
    false,
  );
});
```

**5. Update UPDATE test (lines 271-282):**

```ts
it('UPDATE with params uses run() with explicit transaction:false', async () => {
  mockDbConn.run.mockResolvedValueOnce({
    changes: { changes: 1 },
  });

  await conn.execute('UPDATE t SET val = ? WHERE id = ?', ['world', 1]);

  expect(mockDbConn.run).toHaveBeenCalledWith(
    'UPDATE t SET val = ? WHERE id = ?',
    ['world', 1],
    false,
  );
});
```

**6. Update DELETE test (lines 284-295):**

```ts
it('DELETE with params uses run() with explicit transaction:false', async () => {
  mockDbConn.run.mockResolvedValueOnce({
    changes: { changes: 1 },
  });

  await conn.execute('DELETE FROM t WHERE id = ?', [1]);

  expect(mockDbConn.run).toHaveBeenCalledWith(
    'DELETE FROM t WHERE id = ?',
    [1],
    false,
  );
});
```

**7. Update "returns void" test (lines 297-306):**

```ts
it('returns void', async () => {
  mockDbConn.run.mockResolvedValueOnce({
    changes: { changes: 1 },
  });

  const result = await conn.execute('INSERT INTO t (val) VALUES (?)', [
    'hello',
  ]);
  expect(result).toBeUndefined();
});
```

**8. Add a test for `execute()` without params using `dbConn.execute()`:**

```ts
it('execute without params uses dbConn.execute()', async () => {
  mockDbConn.execute.mockResolvedValueOnce({
    changes: { changes: 0 },
  });

  await conn.execute('CREATE TABLE t (id INTEGER PRIMARY KEY)');

  expect(mockDbConn.execute).toHaveBeenCalledWith(
    'CREATE TABLE t (id INTEGER PRIMARY KEY)',
    false,
  );
  expect(mockDbConn.run).not.toHaveBeenCalled();
});
```

**9. Update FK violation test (line 484):**

Change `mockDbConn.execute.mockRejectedValueOnce(...)` to use `mockDbConn.run.mockRejectedValueOnce(...)` since the test passes params to `execute()`.

**Similarly update other constraint error tests** at lines 504, 518, 535, 549, 561 that use `execute` with params — change to `mockDbConn.run.mockRejectedValueOnce(...)`.

**10. Update the "rejects parameter count mismatch" test (line 617):**

This test calls `execute()` with params, but the validation failure happens before the plugin call. Keep using `mockDbConn.execute` for the mock, since `run` won't be called (validation throws first). No change needed here.

**11. Update the "carries sql and params on thrown errors" test (line 561):**

Change `mockDbConn.execute.mockRejectedValueOnce(...)` to `mockDbConn.run.mockRejectedValueOnce(...)` since params are passed.

---

## m2 (Minor): Assert PRAGMA return values in open test

### Fix: `packages/platform/src/capacitor/__tests__/CapacitorSqliteConnection.test.ts`

In the "sets all 4 PRAGMAs via query()" test (line 98), configure the mock to return plausible values and assert non-empty responses:

```ts
it('sets all 4 PRAGMAs via query() and verifies return values', async () => {
  mockDbConn.query
    .mockResolvedValueOnce({ values: [{ foreign_keys: 1 }] })
    .mockResolvedValueOnce({ values: [{ journal_mode: 'wal' }] })
    .mockResolvedValueOnce({ values: [{ synchronous: 1 }] })
    .mockResolvedValueOnce({ values: [{ busy_timeout: 5000 }] });

  await conn.open('test-db');

  expect(mockDbConn.query).toHaveBeenCalledWith('PRAGMA foreign_keys = ON');
  expect(mockDbConn.query).toHaveBeenCalledWith('PRAGMA journal_mode = WAL');
  expect(mockDbConn.query).toHaveBeenCalledWith('PRAGMA synchronous = NORMAL');
  expect(mockDbConn.query).toHaveBeenCalledWith('PRAGMA busy_timeout = 5000');
});
```

---

## m3 (Minor): Replace non-null assertion with null guard

### Fix: `packages/platform/src/capacitor/CapacitorSqliteConnection.ts:131`

**Current:**
```ts
try {
  await _sqlite?.closeConnection(this.dbName!, false);
} catch {
```

**Replace with:**
```ts
try {
  if (this.dbName) {
    await _sqlite?.closeConnection(this.dbName, false);
  }
} catch {
```

The second occurrence (line 198) already safely uses a local `dbPath` variable, so no change needed there. The third occurrence in `close()` (line 224) already has a null guard: `if (this.dbName && _sqlite)` — no change needed there either.

---

## Verification After All Fixes

```sh
pnpm --filter @collectio/platform typecheck
pnpm --filter @collectio/platform lint
pnpm --filter @collectio/platform test
```
