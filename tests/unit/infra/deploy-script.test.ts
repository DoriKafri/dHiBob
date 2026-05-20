import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DEPLOY_SCRIPT_PATH = path.join(REPO_ROOT, 'deploy.sh');

describe('deploy.sh', () => {
  // T-12: deploy.sh exists and has a proper shebang
  it('T-12: exists and has a bash shebang', () => {
    const content = fs.readFileSync(DEPLOY_SCRIPT_PATH, 'utf-8');
    const firstLine = content.split('\n')[0];
    expect(firstLine).toMatch(/^#!\/bin\/bash|^#!\/usr\/bin\/env bash/);
  });

  // T-13: deploy.sh pulls latest code with --ff-only
  it('T-13: pulls latest code with --ff-only', () => {
    const content = fs.readFileSync(DEPLOY_SCRIPT_PATH, 'utf-8');
    expect(content).toContain('git pull --ff-only');
  });

  // T-14: deploy.sh rebuilds Docker containers
  it('T-14: rebuilds Docker containers', () => {
    const content = fs.readFileSync(DEPLOY_SCRIPT_PATH, 'utf-8');
    expect(content).toMatch(/docker\s+compose.*build|docker-compose.*build/);
  });

  // T-15: deploy.sh runs Prisma migrations
  it('T-15: runs Prisma migrations', () => {
    const content = fs.readFileSync(DEPLOY_SCRIPT_PATH, 'utf-8');
    expect(content).toMatch(/prisma\s+migrate/);
  });

  // T-16: deploy.sh includes a health check
  it('T-16: includes a health check against /api/health', () => {
    const content = fs.readFileSync(DEPLOY_SCRIPT_PATH, 'utf-8');
    expect(content).toContain('curl');
    expect(content).toContain('/api/health');
    // Should exit non-zero on failure
    expect(content).toMatch(/exit\s+1/);
  });
});
