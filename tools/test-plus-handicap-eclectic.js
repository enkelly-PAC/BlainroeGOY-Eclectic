// Regression test for the missing "plus handicap" competition report parsing bug.
//
// Scenario: an aggregate competition report renders a plus handicap golfer's
// score as "70 + 04 = 74" (gross + extra strokes = net) instead of the usual
// "88 - 19 = 69" (gross - handicap = net) minus notation. Before the fix,
// parseCompetitionReportCSV only matched the minus pattern, so a plus handicap
// row never matched any known format: score and playingHandicap both stayed
// null, the player was dropped from results/handicaps entirely, and
// calculateEclecticFromScorecards excluded him from Gross and Nett Eclectic
// because he never received a handicap.
//
// This script loads js/fixtures.js and js/app.js into a minimal sandbox
// (stubbed document/localStorage), feeds it a scorecard CSV and an aggregate
// report CSV containing one normal (minus) golfer and one plus handicap
// golfer (David Lally), and asserts:
//   1. The minus notation player still parses exactly as before (regression
//      guard: score, handicap, GOY points unaffected by this fix).
//   2. The plus notation player (David Lally, "70 + 04 = 74") now parses with
//      a score of 74 and a handicap stored as -4 (golf convention: a plus
//      handicap golfer gives strokes rather than receiving them, matching the
//      sign already used for "+" handicaps parsed from dedicated Eclectic
//      CSV exports elsewhere in this file).
//   3. David Lally appears in Gross Eclectic with his scorecard, correct
//      gross/net totals, and a "+4" (not "-4") handicap display.
//   4. David Lally appears in the GOY leaderboard with the correct points for
//      his finishing position, and the other player's GOY points/Nett result
//      are unchanged (no regression to existing minus-notation handling).
//
// Run with: node tools\test-plus-handicap-eclectic.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const repoRoot = path.join(__dirname, '..');
const fixturesSrc = fs.readFileSync(path.join(repoRoot, 'js', 'fixtures.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(repoRoot, 'js', 'app.js'), 'utf8');

// ---- Minimal DOM / storage stubs (same pattern as test-august-medal-merge.js) ----

function makeFakeElement() {
    return {
        style: {},
        innerHTML: '',
        textContent: '',
        children: [],
        appendChild(el) { this.children.push(el); },
        addEventListener() {},
        scrollIntoView() {},
        classList: { add() {}, remove() {} }
    };
}

const storageBacking = new Map();

const fakeDocument = {
    addEventListener() {},
    getElementById() { return makeFakeElement(); },
    querySelector() { return makeFakeElement(); },
    querySelectorAll() { return []; },
    createElement() { return makeFakeElement(); }
};

const fakeLocalStorage = {
    getItem(k) { return storageBacking.has(k) ? storageBacking.get(k) : null; },
    setItem(k, v) { storageBacking.set(k, String(v)); },
    removeItem(k) { storageBacking.delete(k); }
};

const sandbox = {
    document: fakeDocument,
    window: {},
    localStorage: fakeLocalStorage,
    console,
    Date
};
vm.createContext(sandbox);
vm.runInContext(fixturesSrc, sandbox, { filename: 'fixtures.js' });
vm.runInContext(appSrc, sandbox, { filename: 'app.js' });

function run(code) {
    return vm.runInContext(code, sandbox);
}

function loadCsv(text, filename) {
    return run(`processUploadedFile(${JSON.stringify(text)}, ${JSON.stringify(filename)})`);
}

// ---- Unit-level check on the parser itself, independent of Eclectic/GOY wiring ----

const minusReportCsv = [
    'Blainroe Golf Club',
    "Men's September Medal - Competition Result",
    'Competition played on Sunday 6 September 2026 at Blainroe Golf Club',
    'Pos,Name,Category,Score',
    '1,"Murphy, Sean",Nett,"88 - 19 = 69"',
    '2,"Lally, David",Nett,"70 + 04 = 74"'
].join('\n');

const parsed = run(`parseCompetitionReportCSV(${JSON.stringify(minusReportCsv)})`);

const murphyResult = parsed.results.find(r => r.playerName === 'Murphy, Sean');
assert.ok(murphyResult, 'minus notation player should still be parsed (regression guard)');
assert.strictEqual(murphyResult.score, 69, 'minus notation net score should still parse as 69');
assert.strictEqual(murphyResult.playingHandicap, 19, 'minus notation handicap should still parse as a plain positive 19');
assert.strictEqual(parsed.handicaps['Murphy, Sean'], 19, 'minus notation handicap should still be recorded in the handicaps map');

const lallyResult = parsed.results.find(r => r.playerName === 'Lally, David');
assert.ok(lallyResult, 'plus notation player (David Lally) should now be parsed instead of dropped');
assert.strictEqual(lallyResult.score, 74, 'plus notation net score should parse as 74 (70 + 04 = 74)');
assert.strictEqual(lallyResult.playingHandicap, -4,
    'plus notation handicap should be stored as -4 (a plus handicap golfer gives strokes, golf sign convention)');
assert.strictEqual(parsed.handicaps['Lally, David'], -4, 'plus notation handicap should be recorded in the handicaps map as -4');

// ---- Full pipeline: scorecard + report, then Gross/Nett Eclectic and GOY ----

const HEADER = 'Player,Hcp,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18';

const septemberMedalScorecard = [
    'Blainroe Golf Club',
    'Competition Scorecards',
    "Hole by Hole scores returned in the Men's September Medal competition round played on Sunday 6 September 2026 at Blainroe Golf Club",
    HEADER,
    '"Murphy, Sean",19,5,4,4,5,5,4,4,3,4,4,4,4,4,4,3,4,3,5',
    '"Lally, David",-4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,3,3'
].join('\n');

const septemberMedalReport = [
    'Blainroe Golf Club',
    "Men's September Medal - Competition Result",
    'Competition played on Sunday 6 September 2026 at Blainroe Golf Club',
    'Pos,Name,Category,Score',
    '1,"Lally, David",Nett,"70 + 04 = 74"',
    '2,"Murphy, Sean",Nett,"88 - 19 = 69"'
].join('\n');

const scorecardResult = loadCsv(septemberMedalScorecard, 'September-Medal-Competition Scorecards.csv');
const reportResult = loadCsv(septemberMedalReport, "Competition Report (Aggregated Net Result) - Men's September Medal - Sunday 6 September 2026.csv");

assert.ok(!scorecardResult.error, 'September Medal scorecard should parse without error: ' + JSON.stringify(scorecardResult));
assert.ok(!reportResult.error, 'September Medal report should parse without error: ' + JSON.stringify(reportResult));

const eclectic = run('calculateEclecticFromScorecards()');
assert.ok(eclectic, 'Eclectic calculation should produce a result');

const lallyEclectic = eclectic.players.find(p => p.name === 'Lally, David');
assert.ok(lallyEclectic, 'David Lally should now appear in Gross Eclectic (previously excluded, handicap was never set)');
assert.strictEqual(lallyEclectic.gross, 70, 'David Lally gross total should be 70 (sum of scorecard holes)');
assert.strictEqual(lallyEclectic.handicap, -4, 'David Lally Eclectic handicap should be stored as -4');
assert.strictEqual(lallyEclectic.net, 74, 'David Lally Nett total should be 74 (net = gross - handicap = 70 - (-4))');
assert.strictEqual(lallyEclectic.handicapDisplay, '+4', 'David Lally handicap should display as "+4", not "-4"');

const murphyEclectic = eclectic.players.find(p => p.name === 'Murphy, Sean');
assert.ok(murphyEclectic, 'Murphy, Sean (minus notation) should still appear in Eclectic (regression guard)');
assert.strictEqual(murphyEclectic.gross, 73, 'Murphy, Sean gross total should be unaffected by this fix');
assert.strictEqual(murphyEclectic.handicap, 19, 'Murphy, Sean handicap should be unaffected by this fix');
assert.strictEqual(murphyEclectic.net, 54, 'Murphy, Sean Nett total should be unaffected by this fix (73 - 19 = 54)');
assert.strictEqual(murphyEclectic.handicapDisplay, '19', 'Murphy, Sean handicap should still display as a plain positive number');

// ---- GOY: David Lally must be counted, and the other player's points must not regress ----

const goy = run('calculateGOY()');
assert.ok(goy, 'GOY calculation should produce a result now that the report has parseable rows');
const lallyGoy = goy.leaderboard.find(p => p.playerName === 'Lally, David');
const murphyGoy = goy.leaderboard.find(p => p.playerName === 'Murphy, Sean');
assert.ok(lallyGoy, 'David Lally should now appear in the GOY leaderboard (previously dropped entirely)');
assert.ok(murphyGoy, 'Murphy, Sean should still appear in the GOY leaderboard');
assert.strictEqual(lallyGoy.compCount, 1, 'David Lally should be credited with exactly one GOY competition');
assert.strictEqual(murphyGoy.compCount, 1, 'Murphy, Sean GOY competition count should be unaffected by this fix');
assert.ok(lallyGoy.total > murphyGoy.total,
    'David Lally finished 1st and should score more GOY points than Murphy, Sean who finished 2nd');

console.log('All plus/minus handicap notation regression assertions passed.');
console.log('David Lally: gross=' + lallyEclectic.gross + ' handicap=' + lallyEclectic.handicapDisplay + ' net=' + lallyEclectic.net);
console.log('Murphy, Sean: gross=' + murphyEclectic.gross + ' handicap=' + murphyEclectic.handicapDisplay + ' net=' + murphyEclectic.net);
