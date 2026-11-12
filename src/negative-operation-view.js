(function (root) {
  'use strict';

  var MAX_STAGE = 3;
  function number(value) { return value < 0 ? '−' + Math.abs(value) : String(value); }
  function currentStage(ctx) {
    var saved = ctx.local && ctx.local.stage;
    // explain() also sets hinted. An explicit step must therefore take priority.
    if (Number.isInteger(saved) && saved >= 0 && saved <= MAX_STAGE) return saved;
    return ctx.hinted || ctx.solved ? MAX_STAGE : 0;
  }
  function card(positive, extra) {
    return '<span class="nops-card ' + (positive ? 'nops-positive' : 'nops-negative') + (extra ? ' ' + extra : '') + '">' +
      '<span>' + (positive ? '+1' : '−1') + '</span></span>';
  }
  function pile(counts, escape, options) {
    options = options || {};
    var positive = Array.from({ length: counts.positive }, function () { return card(true); }).join('');
    var negative = Array.from({ length: counts.negative }, function (_, index) {
      return card(false, index < (options.markNegative || 0) ? 'is-marked' : '');
    }).join('');
    var label = counts.positive + ' 张正一和 ' + counts.negative + ' 张负一卡';
    return '<div class="nops-card-pile" role="img" aria-label="' + escape(label) + '">' +
      (positive || negative ? positive + negative : '<span class="nops-empty">没有卡片 · 表示 0</span>') + '</div>';
  }
  function zeroPairs(count, escape, removed) {
    return '<div class="nops-zero-pairs' + (removed ? ' are-cancelled' : '') + '" role="img" aria-label="' +
      escape(count + ' 对正一和负一卡，每对合起来为零' + (removed ? '，这些零对已收起' : '')) + '">' +
      Array.from({ length: count }, function () {
        return '<span class="nops-zero-pair">' + card(true) + card(false) + '<small>= 0</small></span>';
      }).join('') + '</div>';
  }
  function label(text, escape) { return '<div class="nops-tray-label">' + escape(text) + '</div>'; }
  function tray(content, text, escape, extra) {
    return '<div class="nops-tray' + (extra ? ' ' + extra : '') + '">' + label(text, escape) + content + '</div>';
  }
  function stageText(model, stage) {
    var c = model.cards, take = c.action === 'remove-negative', quantity = c.quantity;
    if (stage === 0) return {
      title: '先找到出发的数',
      text: '台上的卡代表 ' + number(model.start) + '。先试着想一想，也可以点“看一步”一起摆。'
    };
    if (stage === 1) {
      if (!take) return { title: '放入 ' + quantity + ' 张 −1 卡', text: '加上负 ' + quantity + '，就是放入 ' + quantity + ' 张 −1 卡。先把它们放到一起。' };
      if (c.addZeroPairs) return { title: '先补 ' + c.addZeroPairs + ' 对“零对”', text: '负卡不够拿。一张 +1 和一张 −1 合起来是 0，补上 ' + c.addZeroPairs + ' 对后，台上的值仍是 ' + number(model.start) + '，数轴上的起点不动。' };
      return { title: '找出要拿走的负卡', text: '减去负 ' + quantity + '，就是拿走 ' + quantity + ' 张 −1 卡。台上已经有足够的负卡，虚线圈出了要拿走的卡。' };
    }
    if (stage === 2) {
      if (take) return { title: '拿走 ' + quantity + ' 张 −1 卡', text: '拿走的是负卡。少了负的部分，卡片代表的数变大，所以数轴上要向右走。' };
      if (c.cancelPairs) return { title: '把 ' + c.cancelPairs + ' 对“零对”收起来', text: '每对 +1 和 −1 合起来都是 0。把这些零对一起收起，卡片代表的数不变；放入负卡让原来的数变小，要向左走。' };
      return { title: '看看合在一起的负卡', text: '现在都是 −1 卡。放入负卡后，卡片代表的数变小，所以数轴上要向左走。' };
    }
    return { title: '把卡片和数轴连起来', text: '从 ' + number(model.start) + ' 向' + (model.displacement > 0 ? '右' : '左') + '走 ' + quantity + ' 步，到 ' + number(model.result) + '。每小格是一步，起点不算一步。' };
  }

  function cardTable(ctx, stage) {
    var m = ctx.task.model, c = m.cards, escape = ctx.escape;
    var take = c.action === 'remove-negative', content;
    if (stage === 0) {
      content = tray(pile(c.initial, escape), '原来的卡片', escape);
    } else if (stage === 1 && take && c.addZeroPairs) {
      content = '<div class="nops-preparation">' + tray(pile(c.initial, escape), '原来：' + number(m.start), escape) +
        '<span class="nops-join" aria-hidden="true">＋</span>' + tray(zeroPairs(c.addZeroPairs, escape, false), '新添的零对 · 每对是 0', escape, 'nops-new-tray') + '</div>' +
        '<div class="nops-preserved-value">' + escape('添的是 0，台上的值仍是 ' + number(m.start)) + '</div>';
    } else if (stage === 1 && take) {
      content = tray(pile(c.prepared, escape, { markNegative: c.quantity }), '虚线圈出的负卡，下一步拿走', escape);
    } else if (stage === 1) {
      content = '<div class="nops-preparation">' + tray(pile(c.initial, escape), '原来：' + number(m.start), escape) +
        '<span class="nops-join" aria-hidden="true">＋</span>' + tray(pile({ positive: 0, negative: c.quantity }, escape), '放入 ' + c.quantity + ' 张 −1', escape, 'nops-new-tray') + '</div>';
    } else if (stage === 2 && take) {
      content = '<div class="nops-action-layout">' + tray(pile(c.afterAction, escape), '留在台上的卡', escape) +
        tray(pile({ positive: 0, negative: c.quantity }, escape), '已拿走 · 不在台上了', escape, 'nops-removed-tray') + '</div>';
    } else if (stage === 2 && c.cancelPairs) {
      content = '<div class="nops-action-layout">' + tray(pile(c.remaining, escape), '留在台上的卡', escape) +
        tray(zeroPairs(c.cancelPairs, escape, true), '已收起的零对 · 合起来是 0', escape, 'nops-removed-tray') + '</div>';
    } else {
      content = tray(pile(c.remaining, escape), stage === 3 ? '最后留在台上的卡' : '合在一起的卡', escape);
    }
    var discovery = stage === MAX_STAGE ? '<div class="nops-discovery' + (ctx.solved ? ' is-checked' : '') + '"><span>' +
      (ctx.solved ? '已检查的关系' : '摆卡片的发现') + '</span><strong>' + escape(m.equation) + '</strong></div>' : '';
    return '<section class="nops-workbench" aria-label="正负卡片操作台"><div class="nops-table-heading"><h3>这些卡代表的数</h3>' +
      '<span class="nops-card-key"><b class="nops-key-positive">+1</b><b class="nops-key-negative">−1</b><span>一对 = 0</span></span></div>' +
      content + discovery + '</section>';
  }

  function axis(ctx, stage) {
    var m = ctx.task.model, escape = ctx.escape;
    var minimum = Math.min(-2, m.start, m.result) - 1;
    var maximum = Math.max(2, m.start, m.result) + 1;
    var count = maximum - minimum + 1;
    var final = stage === MAX_STAGE;
    var direction = m.displacement > 0 ? '右' : '左';
    var ticks = [];
    for (var value = minimum; value <= maximum; value++) {
      var classes = value === 0 ? ' is-zero' : '';
      if (value === m.start) classes += ' is-start';
      if (final && value === m.result) classes += ' is-end';
      if (final && m.path.includes(value)) classes += ' is-walked';
      var visibleLabel = count <= 12 || value % 2 === 0 || value === 0;
      var marker = value === m.start ? '<small class="nops-position-tag">' + escape('起点 ' + number(m.start)) + '</small>' : '';
      if (final && value === m.result) marker += '<small class="nops-position-tag is-arrival">' + escape('到 ' + number(m.result)) + '</small>';
      ticks.push('<span class="nops-tick' + classes + '">' + marker + '<i aria-hidden="true"></i><b' + (visibleLabel ? '' : ' class="is-unlabelled" aria-hidden="true"') + '>' + escape(number(value)) + '</b></span>');
    }
    var route = '';
    if (final) {
      var left = ((Math.min(m.start, m.result) - minimum + 0.5) / count) * 100;
      var width = Math.abs(m.displacement) / count * 100;
      route = '<span class="nops-route ' + (m.displacement > 0 ? 'go-right' : 'go-left') + '" style="left:' + escape(left) + '%;width:' + escape(width) + '%" aria-hidden="true"></span>';
    }
    var caption = final ? '从 ' + number(m.start) + ' 向' + direction + '走 ' + Math.abs(m.displacement) + ' 步，到 ' + number(m.result) :
      stage === 2 ? (m.operator === '+' ? '放入负卡，数变小：向左走' : '拿走负卡，数变大：向右走') :
        stage === 1 && m.cards.addZeroPairs ? '只添了零对，仍站在 ' + number(m.start) : '先站在 ' + number(m.start) + '，还没开始走';
    var path = final ? '<ol class="nops-footsteps" aria-label="每一步到达的数">' + m.path.map(function (value, index) {
      return '<li><span>' + escape('第 ' + (index + 1) + ' 步') + '</span><b>' + escape(number(value)) + '</b></li>';
    }).join('') + '</ol>' : '';
    return '<section class="nops-axis-panel" aria-label="数轴"><div class="nops-axis-heading"><span>← 数变小</span><strong>0 是分界</strong><span>数变大 →</span></div>' +
      '<div class="nops-axis" role="img" aria-label="' + escape('数轴从 ' + number(minimum) + ' 到 ' + number(maximum) + '，每一小格是 1。' + caption) +
      '" style="--nops-count:' + escape(count) + ';--nops-edge:' + escape(50 / count) + '%">' + route + ticks.join('') + '</div>' +
      '<p class="nops-axis-caption' + (stage >= 2 ? ' has-direction' : '') + '">' + escape(caption) + '</p>' + path + '</section>';
  }

  function render(ctx) {
    var m = ctx.task.model, escape = ctx.escape, stage = currentStage(ctx), copy = stageText(m, stage);
    var take = m.operator === '−';
    var action = take ? '拿走' : '放入';
    var steps = ['找起点', '摆卡片', '看变化', '连起来'];
    var track = '<ol class="nops-stage-track" aria-label="讲解步骤">' + steps.map(function (title, index) {
      return '<li class="' + (index === stage ? 'is-current' : index < stage ? 'is-visited' : '') + '"' + (index === stage ? ' aria-current="step"' : '') +
        '><span>' + escape(index + 1) + '</span><b>' + escape(title) + '</b></li>';
    }).join('') + '</ol>';
    var controls = '<div class="nops-controls">';
    if (stage > 0) controls += '<button type="button" class="nops-button nops-button-quiet" data-nops-stage="0">收起步骤</button>';
    if (stage < MAX_STAGE) controls += '<button type="button" class="nops-button nops-button-primary" data-nops-stage="' + escape(stage + 1) + '">' +
      (stage === 0 ? '看一步' : '下一步') + '<span aria-hidden="true"> →</span></button>';
    else controls += '<button type="button" class="nops-button nops-button-primary" data-nops-stage="1">重新看一遍</button>';
    if (ctx.solved && stage < MAX_STAGE) controls += '<button type="button" class="nops-button nops-button-quiet" data-nops-stage="3">展开全部</button>';
    controls += '</div>';
    var related = stage === MAX_STAGE ? '<details class="nops-related"><summary>换个运算符，再比较一下</summary><strong>' + escape(m.pair.equation) + '</strong><p>' +
      escape('起点还是 ' + number(m.start) + '，数字还是负 ' + Math.abs(m.operand) + '。改成' + (m.pair.operator === '+' ? '加法，要放入负卡，向左' : '减法，要拿走负卡，向右') +
        '走 ' + Math.abs(m.pair.displacement) + ' 步，到 ' + number(m.pair.result) + '。') + '</p></details>' : '';
    return '<div class="scene nops-scene" data-operation-stage="' + escape(stage) + '">' +
      '<div class="nops-signboard"><span><small>操作</small><b>' + escape(m.operator) + '</b><strong>' + escape(action) + '</strong></span>' +
      '<span><small>数字</small><b>' + escape('(' + number(m.operand) + ')') + '</b><strong>' + escape('负 ' + Math.abs(m.operand)) + '</strong></span></div>' +
      axis(ctx, stage) + '<div class="nops-demonstration">' + track + '<div class="nops-stage-copy"><h2>' + escape(copy.title) + '</h2><p>' + escape(copy.text) + '</p></div>' +
      cardTable(ctx, stage) + controls + related + '</div></div>';
  }

  function bind(element, ctx) {
    element.querySelectorAll('[data-nops-stage]').forEach(function (button) {
      button.onclick = function () {
        var stage = Number(button.dataset.nopsStage);
        if (!Number.isInteger(stage) || stage < 0 || stage > MAX_STAGE) return;
        ctx.explain({ stage: stage });
        var next = element.querySelector('.nops-button-primary');
        if (next) next.focus({ preventScroll: true });
      };
    });
  }

  root.NumberForestViews.register('negative-operation', { render: render, bind: bind, maxStage: MAX_STAGE });
})(globalThis);
