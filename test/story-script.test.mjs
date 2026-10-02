import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createStoryRunner, parseStoryScript } from '../src/utils/storyScript.js';

test('W2G/BEG snapshot reaches the battle boundary through every decision', () => {
  const source = readFileSync(new URL('../public/story/w2g-beg/script.txt', import.meta.url), 'utf8');
  const commands = parseStoryScript(source);
  const runner = createStoryRunner(commands);
  let frame = runner.next();
  let decisions = 0;
  for (let index = 0; index < 500 && frame.type !== 'end'; index += 1) {
    if (frame.type === 'decision') {
      decisions += 1;
      frame = runner.choose(frame.options.at(-1).value);
    } else {
      frame = runner.next();
    }
  }
  assert.equal(commands.length, 333);
  assert.equal(decisions, 6);
  assert.equal(frame.command?.attributes.stageid, 'guide_01');
});

test('changing a choice after stepping back replaces the previous branch', () => {
  const commands = parseStoryScript([
    '[Decision(options="甲;乙", values="1;2")]',
    '[Predicate(references="1")]',
    '[name="甲"] 第一條路',
    '[Predicate(references="2")]',
    '[name="乙"] 第二條路',
    '[Predicate(references="1;2")]',
    '[name="旁白"] 合流',
  ].join('\n'));
  const runner = createStoryRunner(commands);
  assert.equal(runner.next().type, 'decision');
  assert.equal(runner.choose('1').text, '第一條路');
  assert.equal(runner.previous().type, 'decision');
  assert.equal(runner.choose('2').text, '第二條路');
  assert.equal(runner.next().text, '合流');
});
