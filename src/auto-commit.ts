import { OVClient } from './client';

export interface AutoCommitDeps {
  client: OVClient;
  getSessionId: () => string | undefined;
  threshold: number;
  notify: (message: string) => void;
}

export class AutoCommit {
  private counter = 0;

  constructor(private deps: AutoCommitDeps) {}

  handleTurn(): void {
    this.counter++;
    if (this.counter >= this.deps.threshold) {
      this.counter = 0;
      this.commitAsync();
    }
  }

  private commitAsync(): void {
    const sessionId = this.deps.getSessionId();
    if (!sessionId) return;
    this.deps.client
      .commit(sessionId)
      .then(() => this.deps.notify('OpenViking commit complete.'))
      .catch(() => this.deps.notify('OpenViking commit failed.'));
  }

  forceCommit(): void {
    this.counter = 0;
    this.commitAsync();
  }
}
