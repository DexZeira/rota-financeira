import ts from 'typescript';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

// Função para compilar e copiar os testes
function compileTestFile(file) {
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

for (const file of [
  'tests/open-finance.test.ts',
  'src/services/open-finance/types.ts', 'src/services/open-finance/errors.ts', 'src/services/open-finance/provider.ts', 'src/services/open-finance/mock-provider.ts', 'src/services/open-finance/state.ts', 'src/services/open-finance/sync.ts', 'src/services/open-finance/reconciliation.ts',
  'src/services/app-diagnostics.ts', 'src/services/storage-health.ts', 'src/services/emergency-backup.ts', 'src/services/tab-coordination.ts', 'src/services/recovery.ts', 'tests/phase-ten.test.ts',
  'src/services/financial-answer.ts', 'src/services/financial-assistant.ts', 'src/services/notification-preferences.ts', 'src/services/local-notifications.ts', 'tests/phase-nine.test.ts',
  'src/services/investment-period.ts',
  'src/services/investment-benchmark.ts',
  'src/services/investment-ledger.ts', 'src/services/investment-portfolio.ts', 'src/services/passive-income.ts', 'src/services/investment-maturities.ts', 'tests/phase-eight.test.ts',
  'src/services/universal-search.ts', 'src/services/financial-audit.ts', 'src/services/alerts.ts', 'src/services/financial-situation.ts', 'tests/phase-seven.test.ts',
  'src/services/reporting-state.ts', 'src/services/month-close.ts', 'src/services/financial-timeline.ts', 'src/services/financial-change-explainer.ts', 'tests/reporting.test.ts',
  'tests/imports.test.ts',
  'src/services/import/categorization-rules.ts', 'src/services/import/csv-import.ts', 'src/services/import/duplicate-detection.ts', 'src/services/import/import-session.ts', 'src/services/import/import-state.ts', 'src/services/import/ofx-import.ts', 'src/services/import/reconciliation.ts', 'src/services/import/subscription-detection.ts', 'src/services/import/transaction-normalizer.ts', 'src/services/import/types.ts',
  'src/services/decision-types.ts', 'src/services/decision-simulator.ts', 'src/services/financing-simulator.ts', 'src/services/opportunity-cost.ts', 'src/services/buy-now-or-wait.ts', 'tests/decisions.test.ts',
  'src/services/assets.ts', 'src/services/depreciation.ts', 'src/services/net-worth.ts', 'src/services/ownership-cost.ts',
  'tests/wealth.test.ts',
  'src/services/budget.ts', 'src/services/dynamic-target.ts', 'src/services/cost-of-living.ts', 'src/services/emergency-fund.ts', 'src/services/planning-phase-two.ts', 'tests/planning-phase-two.test.ts',
  'src/services/recurrences.ts',
  'src/services/cash-flow.ts',
  'src/services/financial-query.ts',
  'tests/planning.test.ts',
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
  compileTestFile(file);
}

// Agora compilando os arquivos específicos de Open Finance
for (const file of [
  'src/services/open-finance/pluggy-provider.ts',
  'tests/open-finance-real.test.ts',
  'tests/open-finance-deduplication.test.ts',
  'tests/open-finance-ownership.test.ts',
  'tests/open-finance-errors.test.ts'
]) {
  compileTestFile(file);
}

if (process.argv.includes('--compile-only')) process.exit(0);
const result = spawnSync(
  process.execPath,
  [
    '--test',
    '.test-output/tests/phase-nine.test.js',
    '.test-output/tests/phase-eight.test.js',
    '.test-output/tests/phase-seven.test.js',
    '.test-output/tests/reporting.test.js',
    '.test-output/tests/imports.test.js',
    '.test-output/tests/wealth.test.js',
    '.test-output/tests/decisions.test.js',
    '.test-output/tests/planning-phase-two.test.js',
    '.test-output/tests/planning.test.js',
    '.test-output/tests/financial-intelligence.test.js',
    '.test-output/tests/indicators.test.js',
    '.test-output/tests/purchasing-power.test.js',
    'tests/pwa.test.mjs',
    '.test-output/tests/money-quota.test.js',
    '.test-output/tests/virtual-records.test.js',
    '.test-output/tests/cloud-codec.test.js',
    '.test-output/tests/open-finance.test.js',
    '.test-output/tests/phase-ten.test.js',
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
    '.test-output/tests/open-finance-real.test.js',
  ],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
