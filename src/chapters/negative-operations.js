(function (root) {
  'use strict';

  var Core = root.NumberForestCore;
  if (!Core) throw new Error('Load NumberForestCore before the negative-operations chapter.');

  var OFFSET = 10;
  function number(value) { return value < 0 ? '−' + Math.abs(value) : String(value); }
  function term(value) { return value < 0 ? '(' + number(value) + ')' : number(value); }
  function equation(start, operator, operand, result) {
    return term(start) + ' ' + operator + ' ' + term(operand) + ' = ' + number(result);
  }
  function pathFrom(start, displacement) {
    return Array.from({ length: Math.abs(displacement) }, function (_, index) {
      return start + (index + 1) * Math.sign(displacement);
    });
  }

  // A +1 card and a −1 card together represent zero. Adding such a pair
  // preserves the starting value while making negative cards available to take.
  function cardModel(start, operator, quantity) {
    var initial = { positive: Math.max(0, start), negative: Math.max(0, -start) };
    var addZeroPairs = operator === '−' ? Math.max(0, quantity - initial.negative) : 0;
    var prepared = { positive: initial.positive + addZeroPairs, negative: initial.negative + addZeroPairs };
    var afterAction = {
      positive: prepared.positive,
      negative: prepared.negative + (operator === '+' ? quantity : -quantity)
    };
    var cancelPairs = Math.min(afterAction.positive, afterAction.negative);
    return {
      initial: initial,
      addZeroPairs: addZeroPairs,
      prepared: prepared,
      action: operator === '+' ? 'add-negative' : 'remove-negative',
      quantity: quantity,
      afterAction: afterAction,
      cancelPairs: cancelPairs,
      remaining: { positive: afterAction.positive - cancelPairs, negative: afterAction.negative - cancelPairs }
    };
  }

  function cardsLeft(cards) {
    if (cards.positive) return '剩下 ' + cards.positive + ' 张 +1 卡，表示 ' + cards.positive + '。';
    if (cards.negative) return '剩下 ' + cards.negative + ' 张 −1 卡，表示 ' + number(-cards.negative) + '。';
    return '正负卡都没有剩下，结果是 0。';
  }

  function explain(model) {
    var cards = model.cards, quantity = cards.quantity;
    var lines = ['先从 ' + number(model.start) + ' 开始。'];
    if (model.operator === '+') {
      lines.push('加上 ' + term(model.operand) + '，放入 ' + quantity + ' 张 −1 卡。');
    } else {
      lines.push('减去 ' + term(model.operand) + '，就是拿走 ' + quantity + ' 张 −1 卡。');
      if (cards.addZeroPairs) {
        lines.push('负卡不够拿，先补 ' + cards.addZeroPairs + ' 对 +1 和 −1。每一对合起来是 0，原来的数不变。');
      } else {
        lines.push('原来已有 ' + cards.initial.negative + ' 张 −1 卡，可以直接拿走。');
      }
      lines.push('现在拿走 ' + quantity + ' 张 −1 卡。');
    }
    if (cards.cancelPairs) lines.push('再把 ' + cards.cancelPairs + ' 对 +1 和 −1 配成零对。');
    lines.push(cardsLeft(cards.remaining));
    lines.push('数轴上，从 ' + number(model.start) + ' 向' + (model.displacement > 0 ? '右' : '左') +
      '走 ' + quantity + ' 步：' + [model.start].concat(model.path).map(number).join(' → ') + '。');
    lines.push('所以 ' + model.equation + '。');
    if (model.mode === 'contrast') {
      lines.push('换一个运算符比较：' + model.pair.equation + '。加负数向左，减负数向右。');
    }
    return lines.join('\n');
  }

  function choicesFor(context, result, opposite, start) {
    var values = [result];
    // Include the reversed-direction mistake, then nearby positions. The value
    // sent to the shared checker is offset; only its signed label is displayed.
    [opposite, start, result - 1, result + 1, -result, 0].forEach(function (value) {
      if (values.length < 4 && value >= -10 && value <= 10 && !values.includes(value)) values.push(value);
    });
    for (var value = -10; values.length < 4; value++) if (!values.includes(value)) values.push(value);
    for (var index = values.length - 1; index > 0; index--) {
      var other = context.integer(0, index), hold = values[index];
      values[index] = values[other]; values[other] = hold;
    }
    return values.map(function (value) { return { value: value + OFFSET, label: number(value) }; });
  }

  function generate(context) {
    var stage = context.round % 10;
    var start, quantity;
    var operator = stage % 2 === 0 ? '+' : '−';
    if (stage < 2) { start = 3; quantity = 2; }
    else if (stage === 2) { start = context.integer(2, 5); quantity = context.integer(1, start); }
    else if (stage === 3) { start = context.integer(1, 4); quantity = context.integer(1, 4); }
    else if (stage === 4 || stage === 5) { start = 0; quantity = context.integer(1, 4); }
    else if (stage === 6) { start = -context.integer(1, 3); quantity = context.integer(1, 5 + start); }
    else if (stage === 7) { start = -context.integer(1, 4); quantity = -start; }
    else if (stage === 8) { start = context.integer(1, 3); quantity = start + context.integer(1, 3); }
    else { start = -context.integer(1, 3); quantity = -start + context.integer(1, 3); }
    var operand = -quantity;
    var displacement = operator === '+' ? operand : -operand;
    var result = start + displacement;
    var oppositeOperator = operator === '+' ? '−' : '+';
    var oppositeDisplacement = -displacement;
    var oppositeResult = start + oppositeDisplacement;
    var mode = stage < 2 || stage > 7 ? 'contrast' : stage === 2 || stage === 4 ? 'temperature' : 'equation';
    var model = {
      start: start, operator: operator, operand: operand,
      displacement: displacement, result: result, path: pathFrom(start, displacement),
      offset: OFFSET, lessonIndex: stage, mode: mode,
      equation: equation(start, operator, operand, result),
      pair: {
        operator: oppositeOperator, operand: operand, displacement: oppositeDisplacement,
        result: oppositeResult, path: pathFrom(start, oppositeDisplacement),
        equation: equation(start, oppositeOperator, operand, oppositeResult)
      },
      cards: cardModel(start, operator, quantity)
    };
    var expression = term(start) + ' ' + operator + ' ' + term(operand);
    var explanation = explain(model);
    return {
      kind: 'negative-operation',
      prompt: mode === 'temperature' ? '现在是 ' + number(start) + '℃，温度变化了 ' + term(operand) + '℃。' + expression + ' 等于几？' : expression + ' 等于几？',
      instruction: mode === 'temperature' ? '温度变化是负数，表示降温。先找原来的温度，再想一想变化后在哪里。' :
        '先看加号还是减号，再看括号里的负数。用数轴或正负卡片想一想。',
      answer: result + OFFSET, maxAnswer: 20,
      answerLabel: mode === 'temperature' ? '变化后的温度是多少？' : '算式的结果是多少？',
      unit: mode === 'temperature' ? '℃' : '',
      choices: choicesFor(context, result, oppositeResult, start), model: model,
      practice: {
        title: '看清运算符，再看负号',
        tokens: [
          { text: term(start), role: 'a', label: '起点' },
          { text: operator, role: 'operator' },
          { text: term(operand), role: 'b', label: operator === '+' ? '加上这个数' : '减去这个数' },
          { text: '=', role: 'operator' },
          { target: true, role: 'result', label: mode === 'temperature' ? '现在温度（℃）' : '结果' }
        ],
        explanation: explanation
      },
      hint: operator === '+' ? '加上 ' + term(operand) + '，就是放入 ' + quantity + ' 张 −1 卡；在数轴上从 ' + number(start) + ' 向左走 ' + quantity + ' 步。' :
        '减去 ' + term(operand) + '，就是拿走 ' + quantity + ' 张 −1 卡。负卡不够时，可以先补 +1 和 −1 的零对，原来的数不变。在数轴上要向右走。',
      relations: [model.equation, term(start) + (operator === '+' ? ' − ' : ' + ') + quantity + ' = ' + number(result), '对照：' + model.pair.equation],
      success: explanation
    };
  }

  var chapter = Core.registerChapter({
    id: 'negative-operations', title: '雪地加减站', subtitle: '加上负数，减去负数',
    description: '用数轴和正负卡片看清加负数与减负数，再试零起点、负起点和跨过零点。',
    icon: '❄️', accent: '#527fa4', level: '负数运算 · 零对探索', generator: generate
  });
  if (typeof module === 'object' && module.exports) module.exports = chapter;
})(globalThis);
