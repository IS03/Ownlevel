import { describe, expect, it } from '@jest/globals';
import type { LoadPattern } from '@/api/active-session';
import { clearAccountLocalData } from '@/platform/account-local-data';
import { patternDetail, patternTitle, schemeLabel } from './load-pattern-model';
import { LOAD_PATTERN_SILENCE_MAX, loadPatternSilenceKey, readSilenced, writeSilenced } from './load-pattern-silence';

const set = (setNumber: number, actualReps: number, kg: number, targetReps = 10) =>
  ({ setNumber, targetReps, targetWeightKg: kg, targetRir: 2, actualReps, actualWeightKg: kg, isCompleted: true, notes: null });
const memory = () => {
  const map = new Map<string, string>();
  return { map, port: { getItem: async (k: string) => map.get(k) ?? null, setItem: async (k: string, v: string) => { map.set(k, v); },
    removeItem: async (k: string) => { map.delete(k); }, getAllKeys: async () => [...map.keys()] } };
};

describe('#537 · cómo se lee un patrón', () => {
  it('equal sets read as «3 × 10 · 60 kg»; mixed reps or loads stay explicit, in the on-screen number format', () => {
    expect(schemeLabel([{ reps: 10, weightKg: 60 }, { reps: 10, weightKg: 60 }, { reps: 10, weightKg: 60 }])).toBe('3 × 10 · 60 kg');
    expect(schemeLabel([{ reps: 10, weightKg: 62.5 }, { reps: 8, weightKg: 62.5 }])).toBe('10 · 8 reps · 62,5 kg');
    expect(schemeLabel([{ reps: 10, weightKg: 60 }, { reps: 8, weightKg: 62.5 }])).toBe('60 kg × 10 · 62,5 kg × 8');
  });
  it('the surplus line shows the last set against its target', () => {
    const pattern: LoadPattern = { key: 'k', signal: 'surplus', count: 2, scheme: [{ reps: 10, weightKg: 60 }, { reps: 12, weightKg: 60 }],
      sessions: [{ sessionId: 'a', logDate: '2026-11-20', routineName: 'PUSH', sets: [set(1, 10, 60), set(2, 12, 60)] },
        { sessionId: 'b', logDate: '2026-11-16', routineName: 'PUSH', sets: [set(1, 10, 60), set(2, 13, 60)] }] };
    expect(patternTitle(pattern)).toBe('Te sobraron reps las últimas 2 veces');
    expect(patternDetail(pattern)).toBe('Última serie: 12 reps de 10 · 60 kg');
  });
});

describe('#537 · «Mantener este esquema» por cuenta', () => {
  it('round-trips per account, keeps the newest 200 and ignores an unreadable copy', async () => {
    const { map, port } = memory();
    await writeSilenced(port, 'a', ['k1', 'k2', 'k1']);
    expect(await readSilenced(port, 'a')).toEqual(['k1', 'k2']);
    expect(await readSilenced(port, 'b')).toEqual([]);
    await writeSilenced(port, 'a', Array.from({ length: 250 }, (_, i) => `k${i}`));
    const kept = await readSilenced(port, 'a');
    expect(kept).toHaveLength(LOAD_PATTERN_SILENCE_MAX); expect(kept[0]).toBe('k50');
    map.set(loadPatternSilenceKey('a'), '{no');
    expect(await readSilenced(port, 'a')).toEqual([]);
  });
  it('is removed with the deleted account and cannot be written back afterwards (#625)', async () => {
    const { map, port } = memory();
    await writeSilenced(port, 'gone', ['k']); await writeSilenced(port, 'stays', ['k']);
    await clearAccountLocalData(port, 'gone');
    expect(map.has(loadPatternSilenceKey('gone'))).toBe(false); expect(map.has(loadPatternSilenceKey('stays'))).toBe(true);
    await expect(writeSilenced(port, 'gone', ['k2'])).rejects.toThrow();
  });
});
