import { randomUUID } from 'node:crypto';
import { open, rename } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Windows file watchers and scanners can briefly deny replacement of an open file.
export async function renameWithRetry(source, destination) {
  for (let attempt = 0; ; attempt++) {
    try { await rename(source, destination); return; }
    catch (error) {
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 8) throw error;
      await delay(Math.min(100 * 2 ** attempt, 1600));
    }
  }
}

export async function writeAtomic(destination, text) {
  const file = destination instanceof URL ? fileURLToPath(destination) : path.resolve(destination);
  // A unique name prevents another invocation from overwriting our pending snapshot.
  const temp = path.join(path.dirname(file), `${path.basename(file)}.${process.pid}.${randomUUID()}.part`);
  const handle = await open(temp, 'wx');
  try { await handle.writeFile(text, 'utf8'); await handle.sync(); }
  finally { await handle.close(); }
  try { await renameWithRetry(temp, file); }
  catch (error) {
    // Do not delete/truncate the previous destination to get around a file lock.
    // Keep the complete temp snapshot for recovery if the lock remains permanent.
    throw new Error(`Cannot replace ${file} (${error.code}). The previous index is intact; the pending snapshot is at ${temp}. Close applications holding the file and retry.`, { cause: error });
  }
}
