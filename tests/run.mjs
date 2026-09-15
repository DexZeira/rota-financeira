import ts from 'typescript';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
for (const file of [
  'src/services/personal-expenses.ts',
  'src/services/financial-intelligence.ts',
  'tests/financial-intelligence.test.ts',
  'src/services/indicator-cache.ts',
  'src/services/financial-sources.ts',
  'src/services/inflation-indicators.ts',
  'tests/indicators.test.ts',
  'src/services/purchasing-power.ts',
  'tests/purchasing-power.test.ts',
  'src/services/money-codec.ts',
  'src/services/storage-quota.ts',
  'tests/money-quota.test.ts',
  'src/hooks/use-virtual-records.ts',
  'tests/virtual-records.test.ts',
  'src/services/cloud-codec.ts',
  'tests/cloud-codec.test.ts',
  'src/services/auth-session.ts',
  'tests/auth-session.test.ts',
  'src/services/supabase-config.ts',
  'tests/auth-config.test.ts',
  'src/services/sync-core.ts',
  'src/services/auth-errors.ts',
  'tests/cloud-sync.test.ts',
  'src/model.ts',
  'src/insights.ts',
  'src/work-projection.ts',
  'tests/evolution.test.ts',
  'src/component-matching.ts',
  'src/expense-allocation.ts',
  'src/work-results.ts',
  'src/calculations.ts',
  'src/target-sources.ts',
  'src/services/storage.ts',
  'src/services/backup-download.ts',
  'tests/core.test.ts',
  'tests/targets-integration.test.ts',
  'tests/backup-download.test.ts',
  'tests/work-maintenance.test.ts',
  'tests/attribution-matching.test.ts',
  'src/services/market-rates.ts',
  'tests/market-rates.test.ts',
  'src/services/investment-tax.ts',
  'src/services/investment-comparison.ts',
  'src/services/market-quotes.ts',
  'tests/investment-features.test.ts',
  'src/services/market-expectations.ts',
  'src/services/savings-yield.ts',
  'tests/savings-yield.test.ts',
  'tests/savings-integration.test.ts',
  'src/services/work-type.ts',
  'tests/work-type.test.ts',
]) {
  const output = ts
    .transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    })
    .outputText.replace(
      /from (['"])(\.[^'"]+)\1/g,
      (_, q, path) => 'from ' + q + path + '.js' + q,
    );
  const dest = '.test-output/' + file.replace(/\.ts$/, '.js');
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, output);
}
const result = spawnSync(
  process.execPath,
  [
    '--test',
    '.test-output/tests/financial-intelligence.test.js',
    '.test-output/tests/indicators.test.js',
    '.test-output/tests/purchasing-power.test.js',
    'tests/pwa.test.mjs',
    '.test-output/tests/money-quota.test.js',
    '.test-output/tests/virtual-records.test.js',
    '.test-output/tests/cloud-codec.test.js',
    '.test-output/tests/auth-session.test.js',
    '.test-output/tests/auth-config.test.js',
    '.test-output/tests/cloud-sync.test.js',
    '.test-output/tests/core.test.js',
    '.test-output/tests/evolution.test.js',
    '.test-output/tests/targets-integration.test.js',
    '.test-output/tests/backup-download.test.js',
    '.test-output/tests/work-maintenance.test.js',
    '.test-output/tests/attribution-matching.test.js',
    '.test-output/tests/market-rates.test.js',
    '.test-output/tests/investment-features.test.js',
    '.test-output/tests/savings-yield.test.js',
    '.test-output/tests/savings-integration.test.js',
    '.test-output/tests/work-type.test.js',
  ],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
