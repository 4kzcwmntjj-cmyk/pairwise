const ENDPOINT = 'https://graphql.anilist.co';
/** AniList currently allows 30 requests a minute; stay under it with room for its burst limiter. */
const MIN_INTERVAL_MS = 2600;

let lastCall = 0;
let chain: Promise<unknown> = Promise.resolve();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class AniListError extends Error {
  constructor(
    message: string,
    public readonly kind: 'rate' | 'unavailable' | 'complexity' | 'network' | 'other',
  ) {
    super(message);
  }
}

/** Runs one GraphQL query, queued so calls never exceed the rate limit. */
export function gql<T>(query: string, variables: Record<string, unknown>, onWait?: (s: number) => void): Promise<T> {
  const run = async (): Promise<T> => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const gap = lastCall + MIN_INTERVAL_MS - Date.now();
      if (gap > 0) await sleep(gap);
      lastCall = Date.now();
      let res: Response;
      try {
        res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ query, variables }),
        });
      } catch {
        throw new AniListError('Could not reach AniList. Check your connection and try again.', 'network');
      }
      if (res.status === 429) {
        const wait = Number(res.headers.get('Retry-After')) || 60;
        onWait?.(wait);
        await sleep(wait * 1000 + 500);
        continue;
      }
      const body = await res.json().catch(() => null);
      if (res.status === 403) {
        throw new AniListError('AniList has paused its API for now. Try again later.', 'unavailable');
      }
      const message: string | undefined = body?.errors?.[0]?.message;
      if (message) {
        const kind = /complex/i.test(message) ? 'complexity' : 'other';
        throw new AniListError(`AniList: ${message}`, kind);
      }
      if (!res.ok || !body?.data) throw new AniListError(`AniList returned an error (${res.status}).`, 'other');
      return body.data as T;
    }
    throw new AniListError('AniList is limiting requests. Wait a minute and try again.', 'rate');
  };
  const next = chain.then(run, run);
  chain = next.catch(() => undefined);
  return next;
}
