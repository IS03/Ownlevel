import { expect, it, jest } from '@jest/globals';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { belongsToAccount, clearAccountLocalData, writeAccountRecord } from './account-local-data';
const USER = 'account-a', OTHER = 'account-ab';
function storage() {
  const values = new Map<string, string>();
  return { values, getAllKeys: jest.fn(async () => [...values.keys()]), setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }), removeItem: jest.fn(async (key: string) => { values.delete(key); }) };
}
it('removes only the confirmed account, preserves global preferences and blocks late writes', async () => {
  const port = storage();
  for (const key of [`ownlevel.body.intent.v1.${USER}`, `ownlevel.active.v1.${USER}.session.timer`, `ownlevel.body.intent.v1.${OTHER}`, 'ownlevel.theme.v1', 'ownlevel.haptics.v1', `foreign.${USER}`]) port.values.set(key, 'private');
  await clearAccountLocalData(port, USER);
  expect([...port.values.keys()]).toEqual([`ownlevel.body.intent.v1.${OTHER}`, 'ownlevel.theme.v1', 'ownlevel.haptics.v1', `foreign.${USER}`]);
  await expect(writeAccountRecord(port, `ownlevel.nutrition.quick.v1.${USER}`, 'late')).rejects.toThrow('retired');
  await expect(writeAccountRecord(port, `ownlevel.nutrition.quick.v1.${OTHER}`, 'kept')).resolves.toBeUndefined();
});
it('waits for a write already in storage before purging', async () => {
  const port = storage(), key = `ownlevel.nutrition.quick-options.v1.${USER}`;
  let finish!: () => void;
  port.setItem.mockImplementationOnce(() => new Promise<void>(resolve => { finish = () => { port.values.set(key, 'old'); resolve(); }; }));
  const writing = writeAccountRecord(port, key, 'old'), cleaning = clearAccountLocalData(port, USER);
  await expect(writeAccountRecord(port, key, 'new')).rejects.toThrow('retired');
  expect(port.getAllKeys).not.toHaveBeenCalled();
  finish(); await writing; await cleaning;
  expect(port.values.has(key)).toBe(false);
});
it('continues on storage failures and logs no account or payload', async () => {
  const port = storage(), warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const keys = [`ownlevel.body.intent.v1.${USER}`, `ownlevel.nutrition.quick.v1.${USER}`];
  keys.forEach(key => port.values.set(key, 'private payload'));
  port.removeItem.mockRejectedValueOnce(new Error('private payload'));
  await clearAccountLocalData(port, USER);
  expect(port.removeItem).toHaveBeenCalledTimes(2); expect(port.values.has(keys[1])).toBe(false);
  expect(JSON.stringify(warn.mock.calls)).not.toMatch(/account-a|private payload/);
  port.getAllKeys.mockRejectedValueOnce(new Error('private payload'));
  await expect(clearAccountLocalData(port, USER)).resolves.toBeUndefined();
  warn.mockRestore();
});
it('covers the account-key inventory; new prefixes require a cleanup decision', () => {
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name)) : /\.(ts|tsx)$/.test(entry.name) && !/test/.test(entry.name) ? [join(dir, entry.name)] : []);
  const templates = files(join(__dirname, '..')).flatMap(file => [...readFileSync(file, 'utf8').matchAll(/`(ownlevel\.[^`]*\$\{encodeURIComponent\(userId\)\}[^`]*)`/g)].map(match => match[1]));
  expect([...new Set(templates.map(template => template.split('${')[0]))].sort()).toEqual([
    'ownlevel.active.v1.', 'ownlevel.body.intent.v1.', 'ownlevel.metrics.definitions.intent.v1.',
    'ownlevel.nutrition.config.v1.', 'ownlevel.nutrition.day-write.v1.', 'ownlevel.nutrition.food.v1.', 'ownlevel.nutrition.meal.v1.',
    'ownlevel.nutrition.plate-foods.v1.', 'ownlevel.nutrition.plate.v1.', 'ownlevel.nutrition.quick-options.v1.',
    'ownlevel.nutrition.quick-pins.v1.', 'ownlevel.nutrition.quick.v1.', 'ownlevel.nutrition.saved.v1.', 'ownlevel.nutrition.stages.v2.', 'ownlevel.profile.display-name.v1.',
  ].sort());
  templates.forEach(template => expect(belongsToAccount(template.replace('${encodeURIComponent(userId)}', USER).replace('${encodeURIComponent(sessionId)}', 'session'), USER)).toBe(true));
});
