import ts from 'typescript';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
for (const file of [
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
    '.test-output/tests/cloud-sync.test.js',
    '.test-output/tests/core.test.js',
    '.test-output/tests/evolution.test.js',
    '.test-output/tests/targets-integration.test.js',
    '.test-output/tests/backup-download.test.js',
    '.test-output/tests/work-maintenance.test.js',
    '.test-output/tests/attribution-matching.test.js',
  ],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
