import test from 'node:test';
import assert from 'node:assert/strict';
import { virtualWindow } from '../src/hooks/use-virtual-records';
void test('janela virtual limita 100 mil linhas e conserva altura total no início, meio e fim', () => {
  const heights = Array.from({length:100000},(_,index) => index % 3 === 0 ? 96 : 64);
  for (const scroll of [0, 500000, 7500000]) {
    const v = virtualWindow(heights,scroll);
    assert.ok(v.end-v.start <= 25);
    assert.equal(v.offsets.at(-1),heights.reduce((a,b) => a+b,0));
    assert.ok(v.start >= 0 && v.end <= heights.length);
  }
  assert.deepEqual(virtualWindow([],0),{start:0,end:0,offsets:[0]});
});
