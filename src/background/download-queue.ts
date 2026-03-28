import type { DownloadJob } from '../adapters/types';

const MAX_RETRIES = 2;

interface QueueOptions {
  concurrency: number;
  onUpdate: (jobs: DownloadJob[]) => void;
  onComplete: (job: DownloadJob) => void;
  _executeJob?: (job: DownloadJob, onProgress: (p: number) => void) => Promise<void>;
}

export class DownloadQueue {
  private jobs: DownloadJob[] = [];
  private running = 0;
  private opts: QueueOptions;
  private resolvers: (() => void)[] = [];

  constructor(opts: QueueOptions) {
    this.opts = opts;
  }

  add(job: DownloadJob): void {
    this.jobs.push(job);
    this.opts.onUpdate([...this.jobs]);
    this.tick();
  }

  getJobs(): DownloadJob[] {
    return [...this.jobs];
  }

  updateConcurrency(n: number): void {
    this.opts.concurrency = n;
    this.tick();
  }

  drain(): Promise<void> {
    if (this.jobs.every(j => j.status === 'done' || j.status === 'error')) {
      return Promise.resolve();
    }
    return new Promise(resolve => this.resolvers.push(resolve));
  }

  private tick(): void {
    while (this.running < this.opts.concurrency) {
      const next = this.jobs.find(j => j.status === 'pending');
      if (!next) break;
      this.running++;
      next.status = 'downloading';
      this.opts.onUpdate([...this.jobs]);
      this.run(next).finally(() => {
        this.running--;
        this.tick();
        if (this.jobs.every(j => j.status === 'done' || j.status === 'error')) {
          this.resolvers.forEach(r => r());
          this.resolvers = [];
        }
      });
    }
  }

  private async run(job: DownloadJob): Promise<void> {
    const execute = this.opts._executeJob ?? (() => Promise.reject(new Error('no executor')));
    try {
      await execute(job, (p) => {
        job.progress = p;
        this.opts.onUpdate([...this.jobs]);
      });
      job.status = 'done';
      job.progress = 100;
      this.opts.onUpdate([...this.jobs]);
      this.opts.onComplete(job);
    } catch (err) {
      if (job.retryCount < MAX_RETRIES) {
        job.retryCount++;
        job.status = 'pending';
        this.opts.onUpdate([...this.jobs]);
      } else {
        job.status = 'error';
        job.error = err instanceof Error ? err.message : String(err);
        this.opts.onUpdate([...this.jobs]);
      }
    }
  }
}
