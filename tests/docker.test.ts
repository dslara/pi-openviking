import { describe, it, expect, vi } from 'vitest';
import { DockerManager } from '../src/docker';

describe('DockerManager', () => {
  const createExec = () => vi.fn();

  it('getStatus returns running when container is up', async () => {
    const exec = createExec().mockResolvedValue({
      stdout: 'openviking\n',
      stderr: '',
    });

    const docker = new DockerManager({ exec, confirm: vi.fn(), notify: vi.fn() });
    const status = await docker.getStatus('openviking');

    expect(status).toBe('running');
    expect(exec).toHaveBeenCalledWith('docker', ['ps', '--filter', 'name=openviking', '--format', '{{.Names}}']);
  });

  it('getStatus returns stopped when container exists but is not running', async () => {
    const exec = createExec().mockImplementation((_cmd, args) => {
      if (args[0] === 'ps' && args.includes('-a')) {
        return Promise.resolve({ stdout: 'openviking\n', stderr: '' });
      }
      if (args[0] === 'ps') {
        return Promise.resolve({ stdout: '', stderr: '' });
      }
      return Promise.resolve({ stdout: '', stderr: '' });
    });

    const docker = new DockerManager({ exec, confirm: vi.fn(), notify: vi.fn() });
    const status = await docker.getStatus('openviking');

    expect(status).toBe('stopped');
  });

  it('getStatus returns missing when container does not exist', async () => {
    const exec = createExec().mockResolvedValue({ stdout: '', stderr: '' });

    const docker = new DockerManager({ exec, confirm: vi.fn(), notify: vi.fn() });
    const status = await docker.getStatus('openviking');

    expect(status).toBe('missing');
  });

  it('start calls docker start', async () => {
    const exec = createExec().mockResolvedValue({ stdout: '', stderr: '' });

    const docker = new DockerManager({ exec, confirm: vi.fn(), notify: vi.fn() });
    await docker.start('openviking');

    expect(exec).toHaveBeenCalledWith('docker', ['start', 'openviking']);
  });

  it('ensureNetwork creates network when it does not exist', async () => {
    const exec = createExec().mockImplementation((_cmd, args) => {
      if (args[0] === 'network' && args[1] === 'inspect') {
        return Promise.reject(new Error('Error: No such network'));
      }
      return Promise.resolve({ stdout: '', stderr: '' });
    });

    const docker = new DockerManager({ exec, confirm: vi.fn(), notify: vi.fn() });
    await docker.ensureNetwork('openviking');

    expect(exec).toHaveBeenCalledWith('docker', ['network', 'create', 'openviking']);
  });

  it('ensureRunning starts container after user confirms when stopped', async () => {
    const exec = createExec().mockImplementation((_cmd, args) => {
      if (args[0] === 'ps' && args.includes('-a')) {
        return Promise.resolve({ stdout: 'openviking\n', stderr: '' });
      }
      if (args[0] === 'ps') {
        return Promise.resolve({ stdout: '', stderr: '' });
      }
      return Promise.resolve({ stdout: '', stderr: '' });
    });
    const confirm = vi.fn().mockResolvedValue(true);
    const notify = vi.fn();

    const docker = new DockerManager({ exec, confirm, notify });
    await docker.ensureRunning('openviking');

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Start'));
    expect(exec).toHaveBeenCalledWith('docker', ['start', 'openviking']);
  });

  it('ensureRunning shows instructions when container is missing', async () => {
    const exec = createExec().mockResolvedValue({ stdout: '', stderr: '' });
    const confirm = vi.fn();
    const notify = vi.fn();

    const docker = new DockerManager({ exec, confirm, notify });
    await docker.ensureRunning('openviking');

    expect(confirm).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('docker run'));
  });

  it('gracefully degrades when docker is not available', async () => {
    const exec = createExec().mockRejectedValue(new Error('docker: command not found'));
    const confirm = vi.fn();
    const notify = vi.fn();

    const docker = new DockerManager({ exec, confirm, notify });
    const status = await docker.getStatus('openviking');

    expect(status).toBe('missing');
  });
});
