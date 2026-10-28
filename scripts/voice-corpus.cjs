'use strict';
// Enumerate every bounded integer branch of the real lesson generators.
// This deliberately fails if core's integer adapter changes or a generator
// uses an unenumerated random source; sampling is not complete voice coverage.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const normalizeText = text => text.replace(/\s+/g, '').replace(/[！!]/g, '。').replace(/[？?]/g, '。');
const common = [
  '欢迎来到数感森林。慢慢来，一起发现数的秘密。',
  '答对啦！你发现了数的秘密。',
  '再试试看。一起看看图里的提示吧。',
  '一起看看提示，动手摆一摆吧。',
  ...['松果小屋', '丰收果篮', '阳光花园', '分享之星', '滴答时光'].map(name => '答对啦！这趟探索完成了。看看你的' + name + '徽章！')
];
const guidance = [
  '数一数空位，再放入松果，把篮子补满。',
  '把两篮松果合起来，数一数一共有多少。',
  '把送给朋友的松果拿走，数一数还剩多少。',
  '想一想，还要添上多少，才能和右边一样多。',
  '看看跳动的方向，再数一数跳了几格。',
  '一颗对一颗，看看哪一边更多。也要留意题目问的是多的还是少的。',
  '先找两个挨着、没有空位的数字，看看每次变多还是变少，再找空位里的数。',
  '每篮的数量不变，多添一篮，就多了这么一篮的松果。',
  '先数每篮有几颗，再数一共有几篮。',
  '先看看每篮的数量，再数一数一共有几篮。',
  '每个小伙伴轮流分一颗，分得一样多，才是平均分哦。',
  '每袋装同样多的松果，数一数能装几袋。',
  '先看短短的时针，再看长长的分针。',
  '让分针往前走，再看看时针走到了哪里。'
];

function enumerateCorpus(options = {}) {
  const corePath = options.corePath || path.join(__dirname, '../src/core.js');
  const rounds = options.rounds || 10;
  const source = fs.readFileSync(corePath, 'utf8');
  const integerBody = /function integer\(min, max\) \{[\s\S]*?return min \+ Math\.floor\(sample \* \(max - min \+ 1\)\);\n    \}/;
  if (!integerBody.test(source)) throw new Error('Core integer adapter changed: update the exhaustive voice enumerator before generating audio.');
  const safeMath = Object.create(Math);
  safeMath.random = () => { throw new Error('Voice enumeration requires context.integer, not Math.random().'); };
  const sandbox = { module: { exports: {} }, __choose: null, Math: safeMath };
  vm.runInNewContext(source.replace(integerBody, 'function integer(min, max) { return globalThis.__choose(min, max); }'), sandbox, { filename: corePath, timeout: 1000 });
  const core = sandbox.module.exports;
  const fields = { prompts: new Set(), promptWithInstruction: new Set(), instructions: new Set(), hints: new Set(), success: new Set() };
  const uniqueTasks = new Set();
  const chapters = [];
  for (const chapter of core.chapters) {
    let cases = 0;
    const chapterTasks = new Set();
    const chapterPrompts = new Set();
    function explore(round, prefix) {
      let cursor = 0;
      sandbox.__choose = (min, max) => {
        if (!Number.isInteger(min) || !Number.isInteger(max) || min > max || max - min > 1000) throw new Error('Unbounded or invalid integer range in ' + chapter.id);
        if (cursor === prefix.length) throw { voiceBranch: true, min, max };
        const value = prefix[cursor++];
        if (value < min || value > max) throw new Error('Generator changed its random branch in ' + chapter.id);
        return value;
      };
      try {
        const task = core.createTask(chapter.id, { round, random() { throw new Error('Voice enumeration requires context.integer; direct random() used by ' + chapter.id); } });
        cases++;
        const identity = JSON.stringify(task);
        uniqueTasks.add(identity); chapterTasks.add(identity); chapterPrompts.add(task.prompt);
        fields.prompts.add(task.prompt);
        fields.promptWithInstruction.add(task.prompt + (task.instruction || ''));
        if (task.instruction) fields.instructions.add(task.instruction);
        if (task.hint) fields.hints.add(task.hint);
        if (task.success) fields.success.add(task.success);
      } catch (error) {
        if (!error.voiceBranch) throw error;
        for (let value = error.min; value <= error.max; value++) explore(round, [...prefix, value]);
      }
    }
    for (let round = 0; round < rounds; round++) explore(round, []);
    chapters.push({ chapter: chapter.id, enumeratedCases: cases, uniqueTasks: chapterTasks.size, uniquePrompts: chapterPrompts.size });
  }
  const texts = Object.fromEntries(Object.entries(fields).map(([key, values]) => [key, [...values].sort()]));
  return {
    ...texts, common: [...common], guidance: [...guidance],
    counts: { uniqueTasks: uniqueTasks.size, chapters, texts: Object.fromEntries(Object.entries(texts).map(([key, values]) => [key, { count: values.length, characters: values.reduce((total, text) => total + text.replace(/\s/g, '').length, 0) }])) }
  };
}

module.exports = { enumerateCorpus, normalizeText };
if (require.main === module) process.stdout.write(JSON.stringify(enumerateCorpus(), null, 2) + '\n');
