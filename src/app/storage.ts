/**
 * Whether the browser has agreed to keep this site's data. Without that it may clear it when space runs low
 * (and Safari can clear it after about a week without a visit). Chrome decides without asking, partly on
 * whether the app is installed; Firefox asks the person.
 */
export type Persistence = 'yes' | 'no' | 'unsupported';

export async function checkPersisted(): Promise<Persistence> {
  if (!navigator.storage?.persisted) return 'unsupported';
  try {
    return (await navigator.storage.persisted()) ? 'yes' : 'no';
  } catch {
    return 'unsupported';
  }
}

export async function askPersistence(): Promise<Persistence> {
  if (!navigator.storage?.persist) return 'unsupported';
  try {
    return (await navigator.storage.persist()) ? 'yes' : 'no';
  } catch {
    return 'unsupported';
  }
}

/** Marks plus duels before the browser is asked: enough that there is something worth keeping. */
export const PERSIST_AFTER = 5;
