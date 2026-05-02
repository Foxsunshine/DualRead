// Migration orchestration for the service worker. Every chrome.* surface is
// injected through MigrationDeps so the flow can be exercised in vitest with
// plain Maps and so the deps shape itself proves no broadcaster exists —
// migration must run silently because the side panel would otherwise
// refresh mid-interaction with no user-visible change.
//
// SW eviction can interrupt a pass at any await; the schema_version flag is
// written only after the rewrite succeeds, the migration_lock self-heals on
// a TTL, and migrateRecord is idempotent on v2 input — so the worst case
// (two wakes racing) converges to the same final state.

import {
  LOCAL_KEY_MIGRATION_LOCK,
  LOCAL_KEY_SCHEMA_VERSION,
  LOCAL_KEY_SETTINGS,
  MIGRATION_LOCK_TTL_MS,
  STORAGE_PREFIX_VOCAB,
} from "../shared/messages";
import { migrateRecord } from "../shared/migration";
import { CURRENT_SCHEMA_VERSION } from "../shared/types";
import type { Settings, VocabWord } from "../shared/types";

export interface MigrationDeps {
  // chrome.storage.local.get for {schema_version, migration_lock, settings}
  readLocal: (keys: string[]) => Promise<Record<string, unknown>>;
  writeLocal: (entries: Record<string, unknown>) => Promise<void>;
  removeLocal: (keys: string[]) => Promise<void>;
  // chrome.storage.sync.get(null) returns every key — we filter by prefix.
  readAllSync: () => Promise<Record<string, unknown>>;
  writeSync: (entries: Record<string, VocabWord>) => Promise<void>;
  removeSync: (keys: string[]) => Promise<void>;
  // Defaults applied when settings haven't been seeded yet (fresh install
  // racing with migration of pre-seeded sync data — unlikely but cheap).
  defaultSettings: Settings;
  now: () => number;
}

interface LockRecord {
  acquired_at: number;
}

function isLockFresh(raw: unknown, now: number): boolean {
  if (!raw || typeof raw !== "object") return false;
  const lock = raw as LockRecord;
  if (typeof lock.acquired_at !== "number") return false;
  return now - lock.acquired_at < MIGRATION_LOCK_TTL_MS;
}

export async function runMigration(deps: MigrationDeps): Promise<void> {
  const meta = await deps.readLocal([
    LOCAL_KEY_SCHEMA_VERSION,
    LOCAL_KEY_MIGRATION_LOCK,
    LOCAL_KEY_SETTINGS,
  ]);
  const currentVersion = meta[LOCAL_KEY_SCHEMA_VERSION];
  if (currentVersion === CURRENT_SCHEMA_VERSION) return;

  const now = deps.now();
  if (isLockFresh(meta[LOCAL_KEY_MIGRATION_LOCK], now)) {
    // Another wake is mid-pass; let it finish. The current wake will block
    // on its own migrationReady promise, which means writes serialise
    // naturally — they'll re-await on the next wake.
    return;
  }

  await deps.writeLocal({
    [LOCAL_KEY_MIGRATION_LOCK]: { acquired_at: now } satisfies LockRecord,
  });

  try {
    const settings = (meta[LOCAL_KEY_SETTINGS] as Settings | undefined) ?? deps.defaultSettings;
    const all = await deps.readAllSync();

    const upgrades: Record<string, VocabWord> = {};
    const dropped: string[] = [];

    for (const [storageKey, value] of Object.entries(all)) {
      if (!storageKey.startsWith(STORAGE_PREFIX_VOCAB)) continue;
      const migrated = migrateRecord(value, settings);
      if (migrated === null) {
        dropped.push(storageKey);
        continue;
      }
      // Skip the write if the record is already byte-identical to the
      // migrated form; saves quota when the user upgrades without any v1
      // records left.
      if (
        typeof value === "object" &&
        value !== null &&
        (value as { schema_version?: unknown }).schema_version === CURRENT_SCHEMA_VERSION
      ) {
        continue;
      }
      upgrades[storageKey] = migrated;
    }

    if (Object.keys(upgrades).length > 0) await deps.writeSync(upgrades);
    if (dropped.length > 0) await deps.removeSync(dropped);

    await deps.writeLocal({ [LOCAL_KEY_SCHEMA_VERSION]: CURRENT_SCHEMA_VERSION });
  } finally {
    await deps.removeLocal([LOCAL_KEY_MIGRATION_LOCK]);
  }
}
