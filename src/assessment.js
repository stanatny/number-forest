(function (root, factory) {
  'use strict';
  var assessment = factory();
  if (typeof module === 'object' && module.exports) module.exports = assessment;
  root.NumberForestAssessment = assessment;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function validRounds(rounds) {
    return Number.isSafeInteger(rounds) && rounds > 0 && rounds <= 4294967295;
  }

  function validOutcomes(outcomes, rounds) {
    if (!Array.isArray(outcomes) || !validRounds(outcomes.length) ||
        (rounds !== undefined && outcomes.length !== rounds)) return false;
    for (var index = 0; index < outcomes.length; index++) {
      if (!Object.prototype.hasOwnProperty.call(outcomes, index)) return false;
      var outcome = outcomes[index];
      if (outcome !== null && outcome !== 'correct' && outcome !== 'incorrect' && outcome !== 'legacy') return false;
    }
    return true;
  }

  function create(rounds) {
    if (rounds === undefined) rounds = 10;
    if (!validRounds(rounds)) throw new RangeError('rounds must be a positive integer array length.');
    return Array(rounds).fill(null);
  }

  // The caller supplies a validated boolean, never a numeric answer. An answer
  // of zero is unrelated to whether an assessment is correct. Existing outcomes,
  // including ungraded legacy completions, are never reassigned on another try.
  function submit(outcomes, round, correct) {
    if (!validOutcomes(outcomes)) throw new TypeError('outcomes must be a dense array of supported assessment values.');
    if (!Number.isSafeInteger(round) || round < 0 || round >= outcomes.length) throw new RangeError('round is outside the assessment.');
    if (typeof correct !== 'boolean') throw new TypeError('correct must be a boolean.');
    var next = outcomes.slice();
    var first = next[round] === null;
    if (first) next[round] = correct ? 'correct' : 'incorrect';
    return { outcomes: next, first: first, outcome: next[round] };
  }

  function summarize(outcomes) {
    if (!validOutcomes(outcomes)) throw new TypeError('outcomes must be a dense array of supported assessment values.');
    var summary = { correct: 0, incorrect: 0, legacy: 0, answered: 0 };
    outcomes.forEach(function (outcome) {
      if (outcome === null) return;
      summary[outcome]++;
      summary.answered++;
    });
    return summary;
  }

  // Restore validates only assessment and lesson-position facts. Task, selected
  // answer, manipulation state, timers and global totals belong to the caller.
  // Invalid persisted data returns null rather than guessing a new grade.
  function restore(session, rounds) {
    if (rounds === undefined) rounds = 10;
    if (!validRounds(rounds) || !session || typeof session !== 'object' || Array.isArray(session) ||
        (session.version !== 2 && session.version !== 3) ||
        !Number.isSafeInteger(session.round) || session.round < 0 || session.round >= rounds ||
        !Number.isSafeInteger(session.attempts) || session.attempts < 0 ||
        typeof session.solved !== 'boolean' || (session.solved && session.attempts === 0)) return null;

    var round = session.round;
    if (session.version === 2) {
      // In v2, progressing to the next round required solving the previous one.
      // Its aggregate completion count cannot reconstruct first-attempt grades.
      if (session.completed !== undefined && session.completed !== round + (session.solved ? 1 : 0)) return null;
      var migrated = create(rounds);
      for (var previous = 0; previous < round; previous++) migrated[previous] = 'legacy';
      if (session.solved) migrated[round] = 'legacy';
      else if (session.attempts > 0) migrated[round] = 'incorrect';
      return migrated;
    }

    if (!validOutcomes(session.outcomes, rounds)) return null;
    for (var index = 0; index < rounds; index++) {
      if (index < round && session.outcomes[index] === null) return null;
      if (index > round && session.outcomes[index] !== null) return null;
    }
    var current = session.outcomes[round];
    if (current === null) {
      if (session.attempts !== 0 || session.solved) return null;
    } else {
      if (session.attempts === 0) return null;
      if ((current === 'correct' || current === 'legacy') && !session.solved) return null;
    }
    return session.outcomes.slice();
  }

  return Object.freeze({ create: create, submit: submit, summarize: summarize, restore: restore });
});
