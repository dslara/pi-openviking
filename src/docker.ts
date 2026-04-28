export interface DockerManagerDeps {
  exec(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }>;
  confirm(message: string): Promise<boolean>;
  notify(message: string): void;
}

export type ContainerStatus = 'running' | 'stopped' | 'missing';

export class DockerManager {
  constructor(private deps: DockerManagerDeps) {}

  async getStatus(name: string): Promise<ContainerStatus> {
    try {
      const { stdout: running } = await this.deps.exec('docker', [
        'ps',
        '--filter',
        `name=${name}`,
        '--format',
        '{{.Names}}',
      ]);
      if (running.trim().includes(name)) return 'running';

      const { stdout: all } = await this.deps.exec('docker', [
        'ps',
        '-a',
        '--filter',
        `name=${name}`,
        '--format',
        '{{.Names}}',
      ]);
      if (all.trim().includes(name)) return 'stopped';

      return 'missing';
    } catch {
      return 'missing';
    }
  }

  async start(name: string): Promise<void> {
    await this.deps.exec('docker', ['start', name]);
  }

  async ensureNetwork(name: string): Promise<void> {
    try {
      await this.deps.exec('docker', ['network', 'inspect', name]);
    } catch {
      await this.deps.exec('docker', ['network', 'create', name]);
    }
  }

  async ensureRunning(name: string): Promise<void> {
    const status = await this.getStatus(name);
    if (status === 'running') return;

    if (status === 'stopped') {
      const ok = await this.deps.confirm(
        `Container "${name}" is stopped. Start it now?`
      );
      if (ok) {
        await this.start(name);
        this.deps.notify(`Container "${name}" started.`);
      }
      return;
    }

    this.deps.notify(
      `Container "${name}" not found. Run: docker run -d --name ${name} ...`
    );
  }
}
