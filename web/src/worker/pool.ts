import type { Job, Request, Response, Result } from './protocol';

type Pending = {
  id: number;
  job: Job;
  priority: number;
  resolve: (r: unknown) => void;
  reject: (e: Error) => void;
  signal?: AbortSignal;
};

export class AbortError extends Error {
  constructor() {
    super('aborted');
    this.name = 'AbortError';
  }
}

/** A fixed set of cubiomes workers fed from a priority queue. Jobs whose
 * AbortSignal fires before they start are dropped (e.g. tiles scrolled away). */
export class WorkerPool {
  private idle: Worker[] = [];
  private busy = new Map<Worker, Pending>();
  private queue: Pending[] = [];
  private nextId = 1;
  readonly size: number;

  constructor(size: number) {
    this.size = size;
    for (let i = 0; i < size; i++) {
      const w = new Worker(new URL('./cubiomes.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<Response>) => this.finish(w, e.data);
      this.idle.push(w);
    }
  }

  run<J extends Job>(job: J, opts: { priority?: number; signal?: AbortSignal } = {}): Promise<Result<J>> {
    return new Promise((resolve, reject) => {
      if (opts.signal?.aborted) return reject(new AbortError());
      this.queue.push({
        id: this.nextId++,
        job,
        priority: opts.priority ?? 0,
        resolve: resolve as (r: unknown) => void,
        reject,
        signal: opts.signal,
      });
      this.pump();
    });
  }

  private pump() {
    while (this.idle.length && this.queue.length) {
      // highest priority first, FIFO within the same priority
      let best = 0;
      for (let i = 1; i < this.queue.length; i++) if (this.queue[i].priority > this.queue[best].priority) best = i;
      const p = this.queue.splice(best, 1)[0];
      if (p.signal?.aborted) {
        p.reject(new AbortError());
        continue;
      }
      const w = this.idle.pop()!;
      this.busy.set(w, p);
      w.postMessage({ id: p.id, job: p.job } satisfies Request);
    }
  }

  private finish(w: Worker, msg: Response) {
    const p = this.busy.get(w);
    this.busy.delete(w);
    this.idle.push(w);
    if (p && p.id === msg.id) {
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new Error(msg.error));
    }
    this.pump();
  }
}

const cores = navigator.hardwareConcurrency || 4;
let mapPool: WorkerPool | null = null;
let searchPool: WorkerPool | null = null;

/** Workers for map tiles and lookups. */
export const getPool = () => (mapPool ??= new WorkerPool(Math.max(2, Math.min(6, cores - 1))));

/** Separate workers for long seed searches, so the map stays responsive. */
export const getSearchPool = () => (searchPool ??= new WorkerPool(Math.max(1, Math.min(16, cores - 1))));
