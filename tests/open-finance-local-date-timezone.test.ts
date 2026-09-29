import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

void test('Open Finance: localDateKey usa data local em UTC-03 e não confunde com UTC', () => {
  for (const [TZ, expected] of [
    ['UTC', '2026-09-29'],
    ['America/Fortaleza', '2026-09-28'],
    ['America/Sao_Paulo', '2026-09-28'],
  ]) {
    const script = `
      const { MockOpenFinanceProvider } = await import('./.test-output/src/services/open-finance/mock-provider.js');
      const now = () => new Date('2026-09-29T02:30:00.000Z');
      const provider = new MockOpenFinanceProvider(now);
      const providerCtor = Object.getPrototypeOf(provider).constructor;
      const getTransactions = providerCtor.prototype.getTransactions;
      const result = {};
      await getTransactions.call(provider, {}, {}, 'guest', { since: '2000-01-01', cursor: null }).then((batch) => {
        result.date = batch.items[0].transaction.date;
      });
      process.stdout.write(result.date);
    `;
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', script],
      { env: { ...process.env, TZ }, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, `TZ=${TZ}\n${result.stderr}`);
    assert.equal(result.stdout, expected, `TZ=${TZ}, got ${result.stdout}, expected ${expected}`);
  }
});
