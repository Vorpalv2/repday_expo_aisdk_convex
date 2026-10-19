import { stableSerialize } from '../../lib/stableSerialize';

export type SplitDocument = { clientId: string; position: number; data: any; setTargets?: Record<string, any>; [key: string]: any };
export type SplitCacheEntry = { version: 1; userId: string; revision: number; documents: SplitDocument[] };
export const splitCacheKey = (uid: string) => `repday.splitCache.${uid}`;
export const validRevision = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function decodeSplitCache(raw: string | null, uid: string): SplitCacheEntry | null {
  try {
    const entry = JSON.parse(raw ?? 'null');
    if (entry?.version !== 1 || entry.userId !== uid || !validRevision(entry.revision) || !Array.isArray(entry.documents)) return null;
    if (!entry.documents.every((item: any) => typeof item?.clientId === 'string' && Number.isFinite(item.position) && item.data?.id === item.clientId && Array.isArray(item.data?.moves) && item.data.moves.every((move: any) => move && Array.isArray(move.sets)))) return null;
    if (new Set(entry.documents.map((item: SplitDocument) => item.clientId)).size !== entry.documents.length) return null;
    return entry;
  } catch { return null; }
}

export function splitSessions(documents: SplitDocument[]): any[] {
  return [...documents].sort((a, b) => a.position - b.position).map(split => {
    const session = split.data;
    const targets = Object.values(split.setTargets ?? {});
    return { ...session, moves: session.moves.map((move: any) => {
      const sets = move.sets.map((set: any) => ({ ...set }));
      for (const target of targets.filter(target => target?.moveKey === move.key && Number.isInteger(target.setIndex) && target.setIndex >= 0 && target.setIndex < 100).sort((a, b) => a.setIndex - b.setIndex)) {
        while (sets.length <= target.setIndex) {
          const previous = sets.at(-1);
          sets.push({ weight: previous?.weight ?? '0', reps: previous?.reps ?? '10', done: false });
        }
        sets[target.setIndex] = { ...sets[target.setIndex], weight: String(target.weight ?? sets[target.setIndex].weight), reps: String(target.reps ?? sets[target.setIndex].reps), done: false };
      }
      return { ...move, sets };
    }) };
  });
}

export const upsertCachedSplit = (documents: SplitDocument[], item: any, position: number, resetTargets = false): SplitDocument[] => {
  const previous = documents.find(document => document.clientId === item.id);
  return [...documents.filter(document => document.clientId !== item.id), { ...previous, clientId: item.id, position, data: item, ...(resetTargets ? { setTargets: {} } : {}) }];
};
export const appendCachedMove = (document: SplitDocument, move: any): SplitDocument => ({ ...document, data: { ...document.data, moves: document.data.moves.some((value: any) => stableSerialize(value) === stableSerialize(move)) ? document.data.moves : [...document.data.moves, move] } });

type Patch = (documents: SplitDocument[]) => SplitDocument[];
type Options = {
  uid: string;
  read: () => Promise<string | null>;
  write: (entry: SplitCacheEntry) => Promise<void>;
  fetch: () => Promise<{ documents: SplitDocument[]; revision: number }>;
  publish: (entry: SplitCacheEntry, confirmed: boolean) => void;
  error: (error: unknown) => void;
};

/** One complete, account-scoped snapshot. Pending edits never certify a revision. */
export class SplitCacheCoordinator {
  private entry: SplitCacheEntry | null = null;
  private target: { revision: number; mutationId?: string } | null = null;
  private localChanges = new Map<string, { base: number; patch: Patch }>();
  private writes: Promise<void> = Promise.resolve();
  private running = false;
  private stopped = false;
  readonly ready: Promise<void>;

  constructor(private options: Options) {
    this.ready = options.read().then(raw => {
      if (this.stopped) return;
      this.entry = decodeSplitCache(raw, options.uid);
      if (this.entry) options.publish(this.entry, false);
    }).catch(() => {}).then(() => { if (!this.stopped) void this.reconcile(); });
  }

  observe(revision: number, mutationId?: string) {
    // A slower verification read must not replace a newer listener event.
    if (this.target && revision < this.target.revision) return;
    this.target = { revision, mutationId };
    void this.ready.then(() => this.reconcile());
  }

  register(mutationId: string, patch: Patch) {
    if (this.localChanges.size >= 100) this.localChanges.delete(this.localChanges.keys().next().value!);
    if (this.entry && this.target?.revision === this.entry.revision) this.localChanges.set(mutationId, { base: this.entry.revision, patch });
  }
  knowsMutation(mutationId?: string) { return !!mutationId && this.localChanges.has(mutationId); }
  forget(mutationId: string) { this.localChanges.delete(mutationId); }
  stop() { this.stopped = true; this.localChanges.clear(); }

  private save(entry: SplitCacheEntry) {
    this.entry = entry;
    this.options.publish(entry, true);
    // Serialize storage writes; an older async write must never overwrite a newer revision.
    this.writes = this.writes.catch(() => {}).then(() => this.options.write(entry)).catch(error => {
      if (!this.stopped) console.warn('[Repday] Split cache persistence failed', error);
    });
  }

  private async reconcile() {
    if (this.running || this.stopped || !this.target) return;
    this.running = true;
    try {
      for (let attempt = 0; attempt < 4 && !this.stopped && this.target; attempt++) {
        const target = this.target;
        if (this.entry?.revision === target.revision) { this.options.publish(this.entry, true); return; }
        const local = target.mutationId ? this.localChanges.get(target.mutationId) : undefined;
        if (local && this.entry?.revision === local.base && target.revision === local.base + 1) {
          this.localChanges.delete(target.mutationId!);
          this.save({ ...this.entry, revision: target.revision, documents: local.patch(this.entry.documents) });
          continue;
        }
        const result = await this.options.fetch();
        if (this.stopped) return;
        // fetch() checks the revision again AFTER the collection read. A change
        // during that read requires a retry, never stamping old documents as new.
        if (result.revision !== target.revision || this.target.revision !== target.revision) continue;
        this.localChanges.clear();
        this.save({ version: 1, userId: this.options.uid, revision: result.revision, documents: result.documents });
        return;
      }
      if (!this.stopped) throw new Error('Splits changed while loading. Please retry.');
    } catch (error) { if (!this.stopped) this.options.error(error); }
    finally { this.running = false; }
  }
}
