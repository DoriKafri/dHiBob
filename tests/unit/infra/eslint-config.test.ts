import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const ESLINT_CONFIG_PATH = path.join(REPO_ROOT, '.eslintrc.json');

describe('ESLint config', () => {
  // T-18: ESLint config is valid JSON
  it('T-18: .eslintrc.json is valid JSON', () => {
    const raw = fs.readFileSync(ESLINT_CONFIG_PATH, 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  // T-17: ESLint config exists and extends next/core-web-vitals
  it('T-17: extends next/core-web-vitals', () => {
    const raw = fs.readFileSync(ESLINT_CONFIG_PATH, 'utf-8');
    const config = JSON.parse(raw);
    const extendsVal = config.extends;
    if (Array.isArray(extendsVal)) {
      expect(extendsVal).toContain('next/core-web-vitals');
    } else {
      expect(extendsVal).toBe('next/core-web-vitals');
    }
  });
});
