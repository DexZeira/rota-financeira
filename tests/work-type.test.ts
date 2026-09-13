import test from 'node:test';
import assert from 'node:assert/strict';
import { activityForWorkType, workTypeForActivity } from '../src/services/work-type';

void test('fluxo de trabalho identifica e troca Uber, cartões e outro sem apagar atividade personalizada', () => {
  assert.equal(workTypeForActivity('Uber Moto'), 'uber');
  assert.equal(workTypeForActivity('Entrega de cartões'), 'cards');
  assert.equal(workTypeForActivity('Fotografia'), 'other');
  assert.equal(activityForWorkType('uber'), 'Uber Moto');
  assert.equal(activityForWorkType('cards'), 'Entrega de cartões');
  assert.equal(activityForWorkType('other', 'Fotografia'), 'Fotografia');
});
