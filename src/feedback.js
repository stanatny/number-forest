(function (root, factory) {
  'use strict';
  var feedback = factory();
  if (typeof module === 'object' && module.exports) module.exports = feedback;
  root.NumberForestFeedback = feedback;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // direction compares the selected quantity with the target, not an action
  // the child must take. Wrong clock answers have direction/difference = null:
  // their minute encodings are identifiers, never counts of objects.
  function comparison(selected, target) {
    return { direction: selected > target ? 'more' : selected < target ? 'less' : 'equal', difference: Math.abs(selected - target) };
  }

  function result(task, selected, kind, correct, details, title, message, model) {
    var unit = typeof task.unit === 'string' ? task.unit : kind === 'clock' || kind === 'sequence' ||
      kind === 'numberline' ? '' : task.kind === 'group-count' ? '篮' : task.kind === 'pack' ? '袋' : '颗';
    return {
      kind: kind, taskKind: task.kind, correct: correct,
      direction: details.direction, selected: selected, target: task.answer, difference: details.difference,
      unit: kind === 'input' ? '' : unit,
      differenceUnit: kind === 'numberline' ? '步' : kind === 'input' || kind === 'clock' ? '' : unit,
      title: title, message: message, spoken: title + ' ' + message, model: model
    };
  }

  function inputResult(task, selected) {
    return result(task, selected, 'input', false, { direction: null, difference: null },
      '先选一个答案吧', '看看画面，再点一个你想到的答案。', {});
  }

  function timeLabel(hour, minute) {
    return hour + ' 点' + (minute === 0 ? '整' : minute === 30 ? '半' : ' ' + minute + ' 分');
  }

  function clockFeedback(task, selected) {
    var selectedHour = Math.floor(selected / 60);
    var selectedMinute = selected % 60;
    if (selectedHour < 1 || selectedHour > 12) return inputResult(task, selected);
    var forward = task.kind === 'clock-forward';
    var hour = forward ? task.model.targetHour : task.model.hour;
    var minute = forward ? task.model.targetMinute : task.model.minute;
    var hourMismatch = selectedHour !== hour;
    var minuteMismatch = selectedMinute !== minute;
    var correct = !hourMismatch && !minuteMismatch;
    var nextHour = hour === 12 ? 1 : hour + 1;
    var hourClue = minute === 0 ? '短针指着 ' + hour + '，就是 ' + hour + ' 点。' :
      '短针走过 ' + hour + '，还没到 ' + nextHour + '，要从 ' + hour + ' 点读起。';
    var minuteClue = minute === 0 ? '长针指着 12，表示整点。' : '长针指着 6，表示 30 分钟，也就是半点。';
    var title = correct ? '认出时间啦！' : hourMismatch && minuteMismatch ? '两根针，一起看' : hourMismatch ? '再看看短针' : '再看看长针';
    var message = correct ? '这是 ' + timeLabel(hour, minute) + '。' + minuteClue :
      hourMismatch && minuteMismatch ? hourClue + minuteClue : hourMismatch ? hourClue : minuteClue;
    var model = {
      selectedHour: selectedHour, selectedMinute: selectedMinute,
      targetHour: hour, targetMinute: minute, nextHour: nextHour,
      hourMismatch: hourMismatch, minuteMismatch: minuteMismatch,
      selectedLabel: timeLabel(selectedHour, selectedMinute), targetLabel: timeLabel(hour, minute),
      hourAngle: (hour % 12) * 30 + minute / 2, minuteAngle: minute * 6
    };
    if (forward) {
      model.startHour = task.model.hour;
      model.startMinute = task.model.minute;
      model.advance = task.model.advance;
      model.startLabel = timeLabel(model.startHour, model.startMinute);
      model.startHourAngle = (model.startHour % 12) * 30 + model.startMinute / 2;
      model.startMinuteAngle = model.startMinute * 6;
      var duration = model.advance === 30 ? '半小时' : '一小时';
      var movement = model.advance === 30 ? '分针向前走半圈' : '分针向前走一整圈，短针也向前走一格';
      title = correct ? '时间往前走，算对啦！' : '让指针往前走一走';
      message = '从 ' + model.startLabel + ' 开始，过' + duration + '，' + movement + '，会到 ' + model.targetLabel + '。';
      if (!correct && hourMismatch) message += hourClue;
      else if (!correct && minuteMismatch) message += minuteClue;
    }
    return result(task, selected, 'clock', correct, { direction: correct ? 'equal' : null, difference: correct ? 0 : null }, title, message, model);
  }

  function compareFeedback(task, selected) {
    var m = task.model;
    var details = comparison(selected, task.answer);
    var correct = details.direction === 'equal';
    var larger = Math.max(m.a, m.b);
    var smaller = Math.min(m.a, m.b);
    var pairDifference = larger - smaller;
    var askWord = m.ask === 'more' ? '多' : '少';
    var message = '左边 ' + m.a + ' 颗，右边 ' + m.b + ' 颗。两边一颗对一颗地排，' + larger + ' 颗的那边会多出 ' + pairDifference + ' 颗。';
    message += correct ? '你找到了更' + askWord + '的那一边！' : '题目要找更' + askWord + '的那边，再选一次。';
    return result(task, selected, 'compare', correct, details, correct ? '比出来啦！' : '找更' + askWord + '的那一边', message, {
      a: m.a, b: m.b, ask: m.ask, selectedCount: selected, targetCount: task.answer,
      selectedSide: selected === m.a ? 'left' : selected === m.b ? 'right' : null,
      targetSide: task.answer === m.a ? 'left' : 'right',
      largerCount: larger, smallerCount: smaller, pairedCount: smaller, unpairedCount: pairDifference
    });
  }

  function sequenceFeedback(task, selected) {
    var m = task.model;
    var details = comparison(selected, task.answer);
    var correct = details.direction === 'equal';
    var stepSize = Math.abs(m.step);
    var rule = '每次往后都' + (m.step > 0 ? '加 ' : '减 ') + stepSize;
    var values = m.values.slice();
    var completedValues = values.map(function (value, index) { return index === m.missingIndex ? task.answer : value; });
    var previous = m.missingIndex > 0 ? completedValues[m.missingIndex - 1] : null;
    var next = m.missingIndex < completedValues.length - 1 ? completedValues[m.missingIndex + 1] : null;
    var explanation = previous !== null ? '前面是 ' + previous + '，再' + (m.step > 0 ? '加 ' : '减 ') + stepSize + '，就到 ' + task.answer + '。' :
      '后一个是 ' + next + '，倒着找，要' + (m.step > 0 ? '减 ' : '加 ') + stepSize + '，前面就是 ' + task.answer + '。';
    return result(task, selected, 'sequence', correct, details, correct ? '找到规律啦！' : '照着规律再走一步', rule + '。' + explanation, {
      values: values, completedValues: completedValues, step: m.step, missingIndex: m.missingIndex,
      previous: previous, next: next, rule: rule, selectedValue: selected, expectedValue: task.answer
    });
  }

  function numberlineFeedback(task, selected) {
    var m = task.model;
    var details = comparison(selected, task.answer);
    var correct = details.direction === 'equal';
    var travel = m.step > 0 ? '右' : '左';
    var correction = selected > task.answer ? '左' : '右';
    var message = '从 ' + m.start + ' 出发，向' + travel + '走 ' + Math.abs(m.step) + ' 步，落在数字 ' + task.answer + '。';
    if (!correct) message += '你选了 ' + selected + '，再向' + correction + '走 ' + details.difference + ' 步就到了。';
    return result(task, selected, 'numberline', correct, details,
      correct ? '跳到正确的位置啦！' : '再往' + correction + '走 ' + details.difference + ' 步', message, {
        start: m.start, step: m.step, landing: task.answer, selectedPosition: selected,
        travelDirection: m.step > 0 ? 'right' : 'left',
        correctionDirection: correct ? null : selected > task.answer ? 'left' : 'right', correctionSteps: details.difference
      });
  }

  function sharingFeedback(task, selected, options) {
    var m = task.model;
    var details = comparison(selected, task.answer);
    var validBowls = Array.isArray(options.bowls) && options.bowls.length === m.groups &&
      options.bowls.every(function (n) { return Number.isSafeInteger(n) && n >= 0; });
    var bowls = validBowls ? options.bowls.slice() : [];
    var allocated = bowls.reduce(function (sum, n) { return sum + n; }, 0);
    var model = {
      total: m.total, groups: m.groups, perGroup: m.perGroup,
      bowls: bowls, changed: options.changed === true,
      selectedTotal: selected * m.groups, allocated: allocated,
      remaining: Math.max(0, m.total - allocated), overflow: Math.max(0, allocated - m.total),
      unequal: validBowls && bowls.some(function (n) { return n !== bowls[0]; }),
      adjustments: bowls.map(function (n, index) {
        var difference = comparison(n, m.perGroup);
        return { index: index, count: n, target: m.perGroup, direction: difference.direction, difference: difference.difference };
      })
    };
    if (details.direction !== 'equal') {
      model.reason = 'quantity';
      var low = details.direction === 'less';
      var missing = m.total - model.selectedTotal;
      var message = '如果每人分 ' + selected + ' 颗，' + m.groups + ' 人一共' +
        (low ? '分走 ' + model.selectedTotal + ' 颗，还剩 ' + missing + ' 颗。每份还可以多一点。' :
          '需要 ' + model.selectedTotal + ' 颗，可只有 ' + m.total + ' 颗，不够分。每份试着少一点。');
      return result(task, selected, 'sharing', false, details,
        low ? '每份还差 ' + details.difference + ' 颗' : '每份多了 ' + details.difference + ' 颗', message, model);
    }
    if (options.changed === true && (!validBowls || bowls.some(function (n) { return n !== m.perGroup; }))) {
      var title;
      var explanation;
      if (!validBowls) {
        model.reason = 'invalid'; title = '把每一份摆出来';
        explanation = '你算出每人 ' + m.perGroup + ' 颗了。再给每个小伙伴摆上一样多的松果。';
      } else if (model.overflow > 0) {
        model.reason = 'overflow'; title = '多放了 ' + model.overflow + ' 颗';
        explanation = '一共只有 ' + m.total + ' 颗松果。先取回多放的，再让每人都有 ' + m.perGroup + ' 颗。';
      } else if (model.remaining > 0) {
        model.reason = 'remaining'; title = '还有 ' + model.remaining + ' 颗没分完';
        explanation = '你算出每人 ' + m.perGroup + ' 颗了。把剩下的松果接着分，让每个小伙伴都拿到一样多。';
      } else {
        model.reason = 'unequal'; title = '分完啦，再分一样多';
        explanation = '松果分完了，可每份还不一样多。从多的小伙伴那里取一颗，给少的小伙伴试试看。';
      }
      return result(task, selected, 'sharing', false, details, title, explanation, model);
    }
    model.reason = 'correct';
    return result(task, selected, 'sharing', true, details, '分得刚刚好！',
      m.total + ' 颗松果分给 ' + m.groups + ' 个小伙伴，每人 ' + m.perGroup + ' 颗，一颗也不剩。', model);
  }

  function quantityFeedback(task, selected) {
    var details = comparison(selected, task.answer);
    var correct = details.direction === 'equal';
    var low = details.direction === 'less';
    var m = task.model;
    var model = Object.assign({}, m, { selectedCount: selected, targetCount: task.answer });
    var title = correct ? '刚刚好！' : low ? '还差 ' + details.difference + ' 颗' : '多了 ' + details.difference + ' 颗';
    var message;
    if (task.kind === 'bonds') {
      model.currentTotal = m.visible + selected;
      model.requiredTotal = m.total;
      title = correct ? '补齐啦！' : title;
      message = correct ? '已有 ' + m.visible + ' 颗，再补 ' + selected + ' 颗，正好凑成 ' + m.total + ' 颗。' :
        '已有 ' + m.visible + ' 颗，再补 ' + selected + ' 颗，会有 ' + model.currentTotal + ' 颗。' +
        '篮子需要 ' + m.total + ' 颗，' + (low ? '还差 ' : '多了 ') + details.difference + ' 颗。';
    } else if (task.kind === 'add') {
      title = correct ? '合起来，算对啦！' : title;
      message = correct ? m.a + ' 颗和 ' + m.b + ' 颗合在一起，就是 ' + task.answer + ' 颗。' :
        '你选了 ' + selected + ' 颗，比两篮合起来' + (low ? '少 ' : '多 ') + details.difference + ' 颗。' +
        '从 ' + m.a + ' 开始，再接着数 ' + m.b + ' 个。';
    } else if (task.kind === 'subtract') {
      title = correct ? '找对剩下的啦！' : title;
      message = correct ? m.a + ' 颗拿走 ' + m.b + ' 颗，还剩 ' + task.answer + ' 颗。' :
        '从 ' + m.a + ' 颗里拿走 ' + m.b + ' 颗。你选的 ' + selected + ' 颗，比留下的' +
        (low ? '少 ' : '多 ') + details.difference + ' 颗，再数数留下的松果。';
    } else if (task.kind === 'groups') {
      model.previousTotal = m.perGroup * m.previousGroups;
      model.extraGroup = m.perGroup;
      title = correct ? '多一篮，也算对啦！' : title;
      message = correct ? '原来 ' + model.previousTotal + ' 颗，再添一篮 ' + m.perGroup + ' 颗，就是 ' + task.answer + ' 颗。' :
        '原来的 ' + m.previousGroups + ' 篮有 ' + model.previousTotal + ' 颗，再添一篮就多 ' + m.perGroup + ' 颗。' +
        '你选了 ' + selected + ' 颗，' + (low ? '还差 ' : '多了 ') + details.difference + ' 颗。';
    } else if (task.kind === 'group-total') {
      title = correct ? '一篮一篮，数对啦！' : title;
      message = '每篮 ' + m.perGroup + ' 颗，' + m.groups + ' 篮合起来有 ' + m.total + ' 颗。';
      if (!correct) message += '你选了 ' + selected + ' 颗，' + (low ? '还差 ' : '多了 ') + details.difference + ' 颗。可以一篮一篮接着数。';
    } else if (task.kind === 'group-count' || task.kind === 'pack') {
      var unit = task.kind === 'group-count' ? '篮' : '袋';
      model.selectedTotal = selected * m.perGroup;
      model.requiredTotal = m.total;
      model.remaining = Math.max(0, m.total - model.selectedTotal);
      model.extraCapacity = Math.max(0, model.selectedTotal - m.total);
      title = correct ? '装得刚刚好！' : (low ? '还少 ' : '多了 ') + details.difference + ' ' + unit;
      message = correct ? '每' + unit + ' ' + m.perGroup + ' 颗，' + m.total + ' 颗正好装 ' + task.answer + ' ' + unit + '。' :
        '你选了 ' + selected + ' ' + unit + '，每' + unit + ' ' + m.perGroup + ' 颗，能装 ' + model.selectedTotal + ' 颗。' +
        (low ? '还有 ' + model.remaining + ' 颗没装进去。再看看需要几' + unit + '。' :
          '一共只有 ' + m.total + ' 颗，装不满这么多' + unit + '。试着少选一' + unit + '。');
    } else {
      message = correct ? '你找到了正确的数量。' : '你选了 ' + selected + '，' + (low ? '还少 ' : '多了 ') + details.difference + '。再看看画面里的数量。';
    }
    return result(task, selected, 'quantity', correct, details, title, message, model);
  }

  function describe(task, selected, options) {
    if (!task || !Number.isSafeInteger(task.answer) || task.answer < 0 || !task.model || typeof task.model !== 'object') {
      throw new TypeError('Feedback needs a task with a nonnegative integer answer and a model.');
    }
    if (!Number.isSafeInteger(selected) || selected < 0) return inputResult(task, selected);
    if (task.kind === 'clock' || task.kind === 'clock-forward') return clockFeedback(task, selected);
    if (task.kind === 'compare') return compareFeedback(task, selected);
    if (task.kind === 'sequence') return sequenceFeedback(task, selected);
    if (task.kind === 'numberline') return numberlineFeedback(task, selected);
    if (task.kind === 'sharing') return sharingFeedback(task, selected, options || {});
    return quantityFeedback(task, selected);
  }

  return Object.freeze({ describe: describe });
});
