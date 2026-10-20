import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { parseNutritionStages } from './nutrition-stages-contract';

// Uses the repository's existing embedded-postgres test tooling, never a remote database.
// OWNLEVEL_TEST_MODULES=/path/to/tooling/node_modules npm test -- nutrition-stages
describe.skipIf(!process.env.OWNLEVEL_TEST_MODULES)('Nutrition stages on disposable PostgreSQL', () => {
  it('applies the real migration and verifies dates, engine, history, CAS, receipts, concurrency, RLS and compatibility', () => {
    const output = execFileSync(process.execPath, ['scripts/testing/nutrition-stages.mjs'], {
      encoding: 'utf8', env: process.env, timeout: 90000, maxBuffer: 4 * 1024 * 1024,
    });
    expect(output).toContain('23 Postgres integration groups passed');
    const line = output.split('\n').find(s => s.startsWith('STAGES_SNAPSHOT '));
    expect(line).toBeDefined();
    expect(parseNutritionStages(JSON.parse(line!.slice('STAGES_SNAPSHOT '.length)))).toBeDefined();
    const v2 = output.split('\n').find(s => s.startsWith('STAGES_SNAPSHOT_V2 '));
    expect(v2).toBeDefined();
    expect(parseNutritionStages(JSON.parse(v2!.slice('STAGES_SNAPSHOT_V2 '.length)), 2)).toBeDefined();
  }, 95000);
});
