import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CI_PATH = path.join(REPO_ROOT, '.github', 'workflows', 'ci.yml');
const CD_PATH = path.join(REPO_ROOT, '.github', 'workflows', 'cd.yml');
const RELEASE_PATH = path.join(REPO_ROOT, '.github', 'workflows', 'release.yml');

// Helper: collect all run: commands from all steps in all jobs
function collectRunCommands(parsed: any): string[] {
  const runs: string[] = [];
  if (!parsed.jobs) return runs;
  for (const jobKey of Object.keys(parsed.jobs)) {
    const job = parsed.jobs[jobKey];
    if (!job.steps) continue;
    for (const step of job.steps) {
      if (step.run) runs.push(step.run);
    }
  }
  return runs;
}

// Helper: collect all steps from all jobs
function collectSteps(parsed: any): any[] {
  const steps: any[] = [];
  if (!parsed.jobs) return steps;
  for (const jobKey of Object.keys(parsed.jobs)) {
    const job = parsed.jobs[jobKey];
    if (job.steps) steps.push(...job.steps);
  }
  return steps;
}

// Helper: collect env vars from job-level and step-level
function collectEnvVars(parsed: any): Record<string, string> {
  const envs: Record<string, string> = {};
  if (!parsed.jobs) return envs;
  for (const jobKey of Object.keys(parsed.jobs)) {
    const job = parsed.jobs[jobKey];
    if (job.env) Object.assign(envs, job.env);
    if (job.steps) {
      for (const step of job.steps) {
        if (step.env) Object.assign(envs, step.env);
      }
    }
  }
  return envs;
}

describe('CI workflow (.github/workflows/ci.yml)', () => {
  // T-01: CI workflow file is valid YAML with correct structure
  it('T-01: is valid YAML with on and jobs keys', () => {
    const raw = fs.readFileSync(CI_PATH, 'utf-8');
    const parsed = yaml.load(raw) as any;
    expect(parsed).toBeDefined();
    expect(parsed).toHaveProperty('on');
    expect(parsed).toHaveProperty('jobs');
  });

  // T-02: CI workflow triggers on push and pull_request to main
  it('T-02: triggers on push and pull_request', () => {
    const raw = fs.readFileSync(CI_PATH, 'utf-8');
    const parsed = yaml.load(raw) as any;
    const triggers = parsed.on || parsed[true]; // YAML 'on' can parse as boolean key
    expect(triggers).toHaveProperty('push');
    expect(triggers).toHaveProperty('pull_request');
  });

  // T-03: CI workflow includes lint, typecheck, test, and build steps
  it('T-03: includes lint, typecheck, test, and build steps', () => {
    const raw = fs.readFileSync(CI_PATH, 'utf-8');
    const parsed = yaml.load(raw) as any;
    const runs = collectRunCommands(parsed);
    const allRuns = runs.join('\n');
    expect(allRuns).toMatch(/lint/i);
    expect(allRuns).toMatch(/tsc/i);
    expect(allRuns).toMatch(/test/i);
    expect(allRuns).toMatch(/build/i);
  });

  // T-04: CI workflow uses Node 20
  it('T-04: uses Node 20', () => {
    const raw = fs.readFileSync(CI_PATH, 'utf-8');
    const parsed = yaml.load(raw) as any;
    const steps = collectSteps(parsed);
    const setupNode = steps.find(
      (s: any) => s.uses && s.uses.includes('actions/setup-node')
    );
    expect(setupNode).toBeDefined();
    const nodeVersion = String(setupNode.with['node-version']);
    expect(nodeVersion).toMatch(/^20/);
  });

  // T-05: CI workflow includes Postgres service for integration tests
  it('T-05: includes Postgres service with port 5432', () => {
    const raw = fs.readFileSync(CI_PATH, 'utf-8');
    const parsed = yaml.load(raw) as any;
    let foundPostgres = false;
    for (const jobKey of Object.keys(parsed.jobs)) {
      const job = parsed.jobs[jobKey];
      if (!job.services) continue;
      for (const svcKey of Object.keys(job.services)) {
        const svc = job.services[svcKey];
        if (svc.image && svc.image.includes('postgres')) {
          foundPostgres = true;
          const ports = svc.ports?.map(String) || [];
          expect(ports.some((p: string) => p.includes('5432'))).toBe(true);
        }
      }
    }
    expect(foundPostgres).toBe(true);
  });

  // T-06: CI workflow sets DATABASE_URL and TEST_DATABASE_URL
  it('T-06: sets DATABASE_URL and TEST_DATABASE_URL env vars', () => {
    const raw = fs.readFileSync(CI_PATH, 'utf-8');
    const parsed = yaml.load(raw) as any;
    const envs = collectEnvVars(parsed);
    expect(envs).toHaveProperty('DATABASE_URL');
    expect(envs).toHaveProperty('TEST_DATABASE_URL');
    expect(String(envs.DATABASE_URL)).toContain('postgresql://');
    expect(String(envs.TEST_DATABASE_URL)).toContain('postgresql://');
  });

  // T-07: CI workflow runs prisma generate before lint/typecheck
  it('T-07: runs prisma generate before lint, tsc, test, and build', () => {
    const raw = fs.readFileSync(CI_PATH, 'utf-8');
    const parsed = yaml.load(raw) as any;
    const runs = collectRunCommands(parsed);
    const prismaIdx = runs.findIndex((r) => r.includes('prisma generate'));
    const lintIdx = runs.findIndex((r) => /lint/i.test(r));
    const tscIdx = runs.findIndex((r) => /tsc/i.test(r));
    const testIdx = runs.findIndex((r) => /test/i.test(r));
    const buildIdx = runs.findIndex((r) => /build/i.test(r));

    expect(prismaIdx).toBeGreaterThanOrEqual(0);
    expect(prismaIdx).toBeLessThan(lintIdx);
    expect(prismaIdx).toBeLessThan(tscIdx);
    expect(prismaIdx).toBeLessThan(testIdx);
    expect(prismaIdx).toBeLessThan(buildIdx);
  });
});

describe('CD workflow (.github/workflows/cd.yml)', () => {
  // T-08: CD workflow deploys only after CI passes on main
  it('T-08: triggers on workflow_run after CI on main', () => {
    const raw = fs.readFileSync(CD_PATH, 'utf-8');
    const parsed = yaml.load(raw) as any;
    const triggers = parsed.on || parsed[true];
    expect(triggers).toHaveProperty('workflow_run');
    expect(triggers.workflow_run.workflows).toContain('CI');
    expect(triggers.workflow_run.types).toContain('completed');
    expect(triggers.workflow_run.branches).toContain('main');
  });

  // T-09: CD workflow references required secrets for SSH deployment
  it('T-09: references EC2_HOST and EC2_SSH_KEY secrets', () => {
    const raw = fs.readFileSync(CD_PATH, 'utf-8');
    expect(raw).toContain('secrets.EC2_HOST');
    expect(raw).toContain('secrets.EC2_SSH_KEY');
  });
});

describe('Release workflow (.github/workflows/release.yml)', () => {
  // T-10: Release workflow supports both tag push and manual dispatch
  it('T-10: supports tag push and workflow_dispatch triggers', () => {
    const raw = fs.readFileSync(RELEASE_PATH, 'utf-8');
    const parsed = yaml.load(raw) as any;
    const triggers = parsed.on || parsed[true];
    expect(triggers).toHaveProperty('push');
    expect(triggers.push).toHaveProperty('tags');
    expect(triggers).toHaveProperty('workflow_dispatch');
  });

  // T-11: Release workflow creates a GitHub Release on tag push
  it('T-11: uses softprops/action-gh-release or similar release action', () => {
    const raw = fs.readFileSync(RELEASE_PATH, 'utf-8');
    expect(raw).toMatch(/softprops\/action-gh-release|actions\/create-release/);
  });
});
