(function (root, factory) {
  'use strict';
  var core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  root.NumberForestCore = core;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var registry = new Map();
  var metadataKeys = ['id', 'title', 'subtitle', 'description', 'icon', 'accent', 'level'];

  function registerChapter(definition) {
    if (!definition || typeof definition.id !== 'string' || !definition.id.trim()) {
      throw new TypeError('A chapter needs a nonempty id.');
    }
    if (typeof definition.generator !== 'function') {
      throw new TypeError('A chapter needs a generator function.');
    }
    if (registry.has(definition.id)) throw new Error('Chapter already registered: ' + definition.id);
    var metadata = {};
    metadataKeys.forEach(function (key) { metadata[key] = definition[key]; });
    Object.freeze(metadata);
    registry.set(definition.id, { metadata: metadata, generator: definition.generator });
    return metadata;
  }

  function getChapter(id) {
    var entry = registry.get(id);
    return entry ? entry.metadata : undefined;
  }

  function createTask(chapterId, options) {
    var entry = registry.get(chapterId);
    if (!entry) throw new RangeError('Unknown chapter: ' + chapterId);
    options = options || {};
    var round = options.round === undefined ? 0 : options.round;
    var random = options.random === undefined ? Math.random : options.random;
    if (!Number.isInteger(round) || round < 0) throw new RangeError('round must be a nonnegative integer.');
    if (typeof random !== 'function') throw new TypeError('random must be a function.');
    function integer(min, max) {
      var sample = random();
      if (typeof sample !== 'number' || !Number.isFinite(sample) || sample < 0 || sample >= 1) {
        throw new RangeError('random must return a number in [0, 1).');
      }
      return min + Math.floor(sample * (max - min + 1));
    }
    var task = entry.generator({
      round: round,
      random: random,
      integer: integer,
      challenge: options.challenge === true
    });
    if (!task || !Number.isInteger(task.answer) || !Number.isInteger(task.maxAnswer) ||
        task.answer < 0 || task.answer > task.maxAnswer) {
      throw new TypeError('A generated task must have an integer answer within its bounds.');
    }
    return Object.assign({}, task, { chapterId: chapterId });
  }

  function checkAnswer(task, value) {
    // The UI explicitly converts a complete input. Empty strings, booleans and
    // numeric-looking strings must never silently become a correct answer.
    return !!task && typeof value === 'number' && Number.isFinite(value) &&
      Number.isInteger(value) && value === task.answer;
  }

  registerChapter({
    id: 'bonds', title: '松果小屋', subtitle: '拆一拆，合一合',
    description: '把 10 以内的数量分成两部分，再合起来。', icon: '🌰', accent: '#b86937', level: '10 以内',
    generator: function (context) {
      var total = context.integer(1, 10);
      var visible = context.integer(0, total);
      var missing = total - visible;
      return {
        kind: 'bonds', prompt: '篮子需要 ' + total + ' 颗松果，已经有 ' + visible + ' 颗，还要补几颗？',
        instruction: '看看篮子里已有的松果，把剩下的空位补齐。',
        answer: missing, maxAnswer: 10, model: { total: total, visible: visible },
        relations: [visible + ' + ' + missing + ' = ' + total, total + ' − ' + visible + ' = ' + missing],
        hint: '从已有的 ' + visible + ' 颗接着数到 ' + total + '，还差几颗？也可以数一数空位。',
        success: '已有 ' + visible + ' 颗，再补上 ' + missing + ' 颗，篮子里就有 ' + total + ' 颗了。'
      };
    }
  });

  registerChapter({
    id: 'arithmetic', title: '森林补给', subtitle: '送来与拿走',
    description: '看见加法怎样合起来，减法怎样拿走。', icon: '🧺', accent: '#47866d', level: '10 以内',
    generator: function (context) {
      var a = context.integer(0, 10);
      var subtract = context.round % 2 === 1;
      var b = context.integer(0, subtract ? a : 10 - a);
      var answer = subtract ? a - b : a + b;
      if (subtract) {
        return {
          kind: 'subtract', prompt: '有 ' + a + ' 颗果子，拿走 ' + b + ' 颗，还剩几颗？',
          instruction: '看清拿走的那一部分，再数留下的果子。', answer: answer, maxAnswer: 10,
          model: { a: a, b: b },
          relations: [a + ' − ' + b + ' = ' + answer, answer + ' + ' + b + ' = ' + a, a + ' − ' + answer + ' = ' + b],
          hint: '把 ' + b + ' 颗果子拿走。剩下的和拿走的，合起来还是 ' + a + ' 颗。',
          success: '剩下 ' + answer + ' 颗；把拿走的 ' + b + ' 颗放回来，又有 ' + a + ' 颗。'
        };
      }
      return {
        kind: 'add', prompt: '原来有 ' + a + ' 颗果子，又送来 ' + b + ' 颗，一共有几颗？',
        instruction: '把两边的果子合起来，也可以从原来的数量接着数。', answer: answer, maxAnswer: 10,
        model: { a: a, b: b },
        relations: [a + ' + ' + b + ' = ' + answer, b + ' + ' + a + ' = ' + answer, answer + ' − ' + b + ' = ' + a],
        hint: '从 ' + a + ' 开始，再往后数 ' + b + ' 个。两边交换位置，总数会变吗？',
        success: '两部分合起来有 ' + answer + ' 颗；拿走刚送来的 ' + b + ' 颗，又剩下 ' + a + ' 颗。'
      };
    }
  });

  registerChapter({
    id: 'groups', title: '种子花园', subtitle: '每组一样多',
    description: '一组一组地数，发现多一组会增加多少。', icon: '🌱', accent: '#638745', level: '每组 2–4 颗',
    generator: function (context) {
      var perGroup = context.round === 0 ? 3 : context.integer(2, 4);
      var groups = context.round === 0 ? 4 : context.integer(2, 4);
      var previousGroups = groups - 1;
      var previousTotal = perGroup * previousGroups;
      var total = perGroup * groups;
      return {
        kind: 'groups',
        prompt: '每篮 ' + perGroup + ' 颗松果，原来有 ' + previousGroups + ' 篮，再添一篮后一共有几颗？',
        instruction: '先看原来的 ' + previousGroups + ' 篮松果，想想再添一篮会多几颗。',
        answer: total, maxAnswer: 16,
        model: { perGroup: perGroup, groups: groups, previousGroups: previousGroups },
        relations: [
          Array(groups).fill(perGroup).join(' + ') + ' = ' + total,
          perGroup + ' × ' + previousGroups + ' = ' + previousTotal,
          perGroup + ' × ' + groups + ' = ' + total,
          previousTotal + ' + ' + perGroup + ' = ' + total
        ],
        hint: '原来的 ' + previousGroups + ' 篮有 ' + previousTotal + ' 颗松果。多一篮，就是再添 ' + perGroup + ' 颗。',
        success: '每篮 ' + perGroup + ' 颗松果，' + groups + ' 篮就是 ' + total + ' 颗。多一篮，总数就多 ' + perGroup + ' 颗！'
      };
    }
  });

  registerChapter({
    id: 'sharing', title: '野餐草地', subtitle: '大家一样多',
    description: '把果子公平地分开，再看看怎样合回来。', icon: '🍎', accent: '#c36b67', level: '平均分一分',
    generator: function (context) {
      var groups = context.round === 0 ? 4 : context.integer(2, 4);
      var perGroup = context.round === 0 ? 3 : context.integer(1, 4);
      var total = groups * perGroup;
      return {
        kind: 'sharing', prompt: total + ' 颗果子分给 ' + groups + ' 个小伙伴，每人一样多，每人分到几颗？',
        instruction: '试着一人分一颗，再分一轮，直到果子分完。',
        answer: perGroup, maxAnswer: 4,
        model: { total: total, groups: groups, perGroup: perGroup },
        relations: [total + ' ÷ ' + groups + ' = ' + perGroup, perGroup + ' × ' + groups + ' = ' + total,
          Array(groups).fill(perGroup).join(' + ') + ' = ' + total],
        hint: '每轮都给每人一颗。每个小伙伴得到的数量要一样，最后也不能剩下。',
        success: '每人 ' + perGroup + ' 颗，' + groups + ' 个人合起来正好是 ' + total + ' 颗。'
      };
    }
  });

  registerChapter({
    id: 'clock', title: '滴答树屋', subtitle: '认识整点与半点',
    description: '观察长针和短针，一起读出钟上的时间。', icon: '🕰️', accent: '#6b7caf', level: '整点与半点',
    generator: function (context) {
      var hour = context.integer(1, 12);
      var minute = context.round < 3 ? 0 : 30;
      var nextHour = hour === 12 ? 1 : hour + 1;
      var time = hour + ':' + (minute === 0 ? '00' : '30');
      return {
        kind: 'clock', prompt: '小松鼠的钟现在是几点？',
        instruction: '先找短短的时针，再看长长的分针。选出钟上的时间。',
        answer: hour * 60 + minute, maxAnswer: 750,
        model: { hour: hour, minute: minute },
        relations: minute === 0 ? [time + ' = ' + hour + ' 点整', '分针指着 12，时针指着 ' + hour] :
          [time + ' = ' + hour + ' 点半', '半小时 = 30 分钟', '时针走在 ' + hour + ' 和 ' + nextHour + ' 的中间'],
        hint: minute === 0 ? '长针指向 12，表示整点。短针指着几，就是几点整。' :
          '长针指向 6，表示过了半小时。短针刚走过 ' + hour + '，还没到 ' + nextHour + '。',
        success: minute === 0 ? '这是 ' + hour + ' 点整。分针走一整圈，时间就过去一小时。' :
          '这是 ' + hour + ' 点半。过了半小时，时针也走到了两个数字中间。'
      };
    }
  });

  return Object.freeze({
    get chapters() {
      return Object.freeze(Array.from(registry.values(), function (entry) { return entry.metadata; }));
    },
    registerChapter: registerChapter,
    getChapter: getChapter,
    createTask: createTask,
    checkAnswer: checkAnswer
  });
});
