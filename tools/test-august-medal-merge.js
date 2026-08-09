// Regression test for the duplicate "August Medal" row bug.
//
// Scenario: two single-day scorecard CSVs (an alt-day round and the Sunday
// round of the same two-day medal) are loaded first, each becoming its own
// competition entry because their dates do not overlap each other. A single
// aggregate report CSV that spans both days is loaded last. Before the fix,
// findMatchingCompetition returned only the first date-overlap match, so the
// report attached to just one of the two scorecard competitions and the UI
// showed two "Men's August Medal" rows instead of one.
//
// This script loads js/fixtures.js and js/app.js into a minimal sandbox
// (stubbed document/localStorage), feeds it synthetic CSV text for the three
// files, and asserts:
//   1. Loaded Competitions renders exactly one visible August Medal row.
//   2. That row has the combined date range, GOY auto-checked, and the
//      aggregate report attached exactly once.
//   3. GOY totals count each player's report result exactly once.
//   4. Eclectic includes both day's scorecards exactly once, dedupes a
//      player name with irregular whitespace, and keeps the best per-hole
//      score across the two days.
//   5. An unrelated competition sharing a date with the medal is not folded
//      into it just because the dates overlap.
//   6. Idempotence: re-importing the exact same three files a second and
//      third time (e.g. the user reloading their files) must not change the
//      visible row count, GOY totals, best-per-hole scores, or any player's
//      rounds-played count. Before the fix, findMatchingCompetition skipped
//      the hidden Sunday competition, so a re-imported Sunday scorecard file
//      routed into the widened-date primary while the original cards stayed
//      in the hidden competition, double counting that day for every player
//      who played it (including a Sunday-only player whose correct rounds
//      count is 1, not 2).
//
// Run with: node tools\test-august-medal-merge.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const repoRoot = path.join(__dirname, '..');
const fixturesSrc = fs.readFileSync(path.join(repoRoot, 'js', 'fixtures.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(repoRoot, 'js', 'app.js'), 'utf8');

// ---- Minimal DOM / storage stubs ----

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

const competitionsTbody = makeFakeElement();
// Clearing innerHTML (as renderCompetitionsTable does at the start of each render)
// must also clear the recorded rows, mirroring real DOM behaviour.
Object.defineProperty(competitionsTbody, 'innerHTML', {
    get() { return this._html || ''; },
    set(v) { this._html = v; this.children = []; }
});
const storageBacking = new Map();

const fakeDocument = {
    addEventListener() {},
    getElementById() { return makeFakeElement(); },
    querySelector(sel) {
        if (sel === '#competitions-table tbody') return competitionsTbody;
        return makeFakeElement();
    },
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

// ---- Synthetic CSV fixtures (dates match GOY_FIXTURES "Men's August Medal": 2026-08-08/09) ----

const HEADER = 'Player,Hcp,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18';

const altDayScorecard = [
    'Blainroe Golf Club',
    'Competition Scorecards',
    "Hole by Hole scores returned in the Men's August Medal (Alt Day) competition round played on Saturday 8 August 2026 at Blainroe Golf Club",
    HEADER,
    '"Murphy, Sean",12,5,4,4,5,5,4,4,3,4,4,4,4,4,4,3,4,3,5',
    '"Byrne, David",18,6,5,5,6,6,5,5,4,5,5,5,5,5,5,4,5,4,6'
].join('\n');

// Same competition's Sunday round. Player 1's name has irregular whitespace
// (double space after the comma) to exercise dedup via normalizePlayerName,
// and hole 1 is lower here than on the alt day, so the best-hole-score logic
// should keep this round's value (4) rather than the alt day's (5).
// "OBrien, Liam" only plays the Sunday round (not the alt day), so his correct
// Eclectic rounds count is 1, not 2. This is the case the idempotence fix
// specifically protects: without it, re-importing this file would route his
// scores into both the hidden Sunday competition and the widened-date primary,
// inflating his rounds count to 2 even though he only ever played once.
const sundayScorecard = [
    'Blainroe Golf Club',
    'Competition Scorecards',
    "Hole by Hole scores returned in the Men's August Medal competition round played on Sunday 9 August 2026 at Blainroe Golf Club",
    HEADER,
    '"Murphy,  Sean",12,4,4,4,5,5,4,4,3,4,4,4,4,4,4,3,4,3,5',
    '"Byrne, David",18,5,5,5,6,6,5,5,4,5,5,5,5,5,5,4,5,4,6',
    '"OBrien, Liam",15,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4'
].join('\n');

const aggregateReport = [
    'Blainroe Golf Club',
    "Men's August Medal - Competition Result",
    'Competition played on Saturday 8 August 2026 and Sunday 9 August 2026 at Blainroe Golf Club',
    'Pos,Name,Category,Score',
    '1,"Murphy, Sean",Nett,"88 - 19 = 69"',
    '2,"Byrne, David",Nett,"95 - 18 = 77"',
    '3,"OBrien, Liam",Nett,"72 - 15 = 57"'
].join('\n');

// Unrelated competition that happens to share the Sunday date, to prove dates
// alone are never sufficient to fold two competitions together.
const unrelatedReport = [
    'Blainroe Golf Club',
    'Ladies August Stableford Trophy - Competition Result',
    'Competition played on Sunday 9 August 2026 at Blainroe Golf Club',
    'Pos,Name,Category,Score',
    '1,"OConnor, Mary",Stableford,"36 pts (18)"'
].join('\n');

// ---- Load in the order described in the task: both day scorecards, then the report ----

const r1 = loadCsv(altDayScorecard, 'August-Medal-AltDay-Competition Scorecards.csv');
const r2 = loadCsv(sundayScorecard, 'August-Medal-Sunday-Competition Scorecards.csv');
const r3 = loadCsv(aggregateReport, "Competition Report (Aggregated Net Result) - Men's August Medal - Sunday 9 August 2026.csv");

assert.ok(!r1.error, 'alt day scorecard should parse without error: ' + JSON.stringify(r1));
assert.ok(!r2.error, 'sunday scorecard should parse without error: ' + JSON.stringify(r2));
assert.ok(!r3.error, 'aggregate report should parse without error: ' + JSON.stringify(r3));

// ---- Assertions on internal state after the 3 August Medal files ----

let competitions = run('appState.competitions');
let visible = competitions.filter(c => !c.hidden);
let augustMedalRows = visible.filter(c => (c.info.name || '').toLowerCase().includes('august medal'));

assert.strictEqual(augustMedalRows.length, 1,
    'expected exactly one visible August Medal row, got ' + augustMedalRows.length +
    ' (' + JSON.stringify(visible.map(c => c.info.name)) + ')');

const medal = augustMedalRows[0];
assert.strictEqual(medal.hasReport, true, 'August Medal row should have the aggregate report attached');
assert.strictEqual(medal.config.isGOY, true, 'August Medal row should be GOY AUTO-checked');
assert.ok(medal.info.date.includes('8 August 2026') && medal.info.date.includes('9 August 2026'),
    'August Medal row should show the combined date range, got: ' + medal.info.date);
assert.strictEqual((medal.mergedCompetitionIds || []).length, 1,
    'August Medal row should have folded exactly one duplicate scorecard competition');

const hiddenDuplicate = competitions.find(c => c.hidden);
assert.ok(hiddenDuplicate, 'the second day scorecard competition should still exist, just hidden from the list');
assert.strictEqual(hiddenDuplicate.mergedIntoId, medal.id, 'hidden duplicate should point back at the primary row');

run('renderCompetitionsTable()');
assert.strictEqual(competitionsTbody.children.length, 1,
    'Loaded Competitions table should render exactly 1 row for the August Medal, got ' +
    competitionsTbody.children.length);

// ---- GOY: the report must be counted exactly once ----

const goy = run('calculateGOY()');
assert.strictEqual(goy.competitions.length, 1, 'GOY should use the aggregate report exactly once');
const murphyGoy = goy.leaderboard.find(p => p.playerName === 'Murphy, Sean');
assert.ok(murphyGoy, 'Murphy, Sean should appear in the GOY leaderboard');
assert.strictEqual(murphyGoy.compCount, 1, 'Murphy, Sean should only be scored once for GOY despite two scorecards');

// ---- Eclectic: both days included exactly once, players deduped, best hole kept ----

const eclectic = run('calculateEclecticFromScorecards()');
const murphyEntries = eclectic.players.filter(p => p.name.replace(/\s+/g, ' ').trim() === 'Murphy, Sean');
assert.strictEqual(murphyEntries.length, 1, 'Murphy, Sean should appear exactly once in Eclectic (deduplicated)');
const murphyEclectic = murphyEntries[0];
assert.strictEqual(murphyEclectic.rounds, 2, 'Murphy, Sean should be credited with both rounds played');
assert.strictEqual(murphyEclectic.scores[0], 4, 'hole 1 should keep the best (lowest) score across both days (4, not 5)');

const obrienEclectic = eclectic.players.find(p => p.name === 'OBrien, Liam');
assert.ok(obrienEclectic, 'OBrien, Liam (Sunday-only player) should appear in Eclectic');
assert.strictEqual(obrienEclectic.rounds, 1, 'OBrien, Liam only played the Sunday round, so rounds should be 1');

// ---- Idempotence: re-importing the same three files must not double count ----
// Re-load the exact same alt day, Sunday, and aggregate report files a second
// and third time (simulating a user re-uploading their files). None of the
// figures already asserted above should change: the visible row count, GOY
// totals, best-per-hole scores, and every player's rounds-played count
// (including OBrien's, which is the case most sensitive to the double-count
// bug since his correct answer, 1, is the smallest possible non-zero value).

for (let reimport = 0; reimport < 2; reimport++) {
    const rr1 = loadCsv(altDayScorecard, 'August-Medal-AltDay-Competition Scorecards.csv');
    const rr2 = loadCsv(sundayScorecard, 'August-Medal-Sunday-Competition Scorecards.csv');
    const rr3 = loadCsv(aggregateReport, "Competition Report (Aggregated Net Result) - Men's August Medal - Sunday 9 August 2026.csv");
    assert.ok(!rr1.error, 'alt day scorecard re-import #' + (reimport + 1) + ' should parse without error');
    assert.ok(!rr2.error, 'sunday scorecard re-import #' + (reimport + 1) + ' should parse without error');
    assert.ok(!rr3.error, 'aggregate report re-import #' + (reimport + 1) + ' should parse without error');

    const compsAfterReimport = run('appState.competitions');
    const visibleAfterReimport = compsAfterReimport.filter(c => !c.hidden);
    const medalRowsAfterReimport = visibleAfterReimport.filter(c => (c.info.name || '').toLowerCase().includes('august medal'));
    assert.strictEqual(medalRowsAfterReimport.length, 1,
        'August Medal should still be exactly one visible row after re-import #' + (reimport + 1) +
        ', got ' + medalRowsAfterReimport.length);
    assert.strictEqual((medalRowsAfterReimport[0].mergedCompetitionIds || []).length, 1,
        'August Medal row should still have exactly one folded duplicate after re-import #' + (reimport + 1) +
        ' (not a growing number of folds)');
    assert.strictEqual(medalRowsAfterReimport[0].id, medal.id,
        'August Medal row identity should be unchanged after re-import #' + (reimport + 1));

    const hiddenAfterReimport = compsAfterReimport.filter(c => c.hidden);
    assert.strictEqual(hiddenAfterReimport.length, 1,
        'there should still be exactly one hidden duplicate after re-import #' + (reimport + 1) +
        ' (re-imports must not create new hidden competitions)');
    assert.strictEqual(hiddenAfterReimport[0].id, hiddenDuplicate.id,
        'the hidden duplicate should still be the same original Sunday competition after re-import #' + (reimport + 1));

    const goyAfterReimport = run('calculateGOY()');
    assert.strictEqual(goyAfterReimport.competitions.length, 1,
        'GOY should still use the aggregate report exactly once after re-import #' + (reimport + 1));
    const murphyGoyAfterReimport = goyAfterReimport.leaderboard.find(p => p.playerName === 'Murphy, Sean');
    assert.strictEqual(murphyGoyAfterReimport.compCount, 1,
        'Murphy, Sean GOY competition count should remain 1 after re-import #' + (reimport + 1));
    assert.strictEqual(murphyGoyAfterReimport.total, murphyGoy.total,
        'Murphy, Sean GOY total should be unchanged after re-import #' + (reimport + 1));

    const eclecticAfterReimport = run('calculateEclecticFromScorecards()');
    const murphyEclecticAfterReimport = eclecticAfterReimport.players.find(p => p.name.replace(/\s+/g, ' ').trim() === 'Murphy, Sean');
    const byrneEclecticAfterReimport = eclecticAfterReimport.players.find(p => p.name === 'Byrne, David');
    const obrienEclecticAfterReimport = eclecticAfterReimport.players.find(p => p.name === 'OBrien, Liam');
    assert.strictEqual(murphyEclecticAfterReimport.rounds, 2,
        'Murphy, Sean rounds should remain 2 after re-import #' + (reimport + 1) + ', not double count to 4');
    assert.strictEqual(byrneEclecticAfterReimport.rounds, 2,
        'Byrne, David rounds should remain 2 after re-import #' + (reimport + 1));
    assert.strictEqual(obrienEclecticAfterReimport.rounds, 1,
        'OBrien, Liam rounds should remain 1 after re-import #' + (reimport + 1) +
        ' (he only ever played the Sunday round; this is the case the idempotence fix protects)');
    assert.strictEqual(murphyEclecticAfterReimport.scores[0], 4,
        'Murphy, Sean best-per-hole score (hole 1) should remain unchanged after re-import #' + (reimport + 1));
    assert.strictEqual(murphyEclecticAfterReimport.gross, murphyEclectic.gross,
        'Murphy, Sean gross total should be unchanged after re-import #' + (reimport + 1));
    assert.strictEqual(obrienEclecticAfterReimport.gross, obrienEclectic.gross,
        'OBrien, Liam gross total should be unchanged after re-import #' + (reimport + 1));

    run('renderCompetitionsTable()');
    assert.strictEqual(competitionsTbody.children.length, 1,
        'Loaded Competitions table should still render exactly 1 row for the August Medal after re-import #' +
        (reimport + 1) + ', got ' + competitionsTbody.children.length);
}

// ---- Unrelated competition sharing a date must never be folded in ----
// Note: this only exercises the merge/fold guard added for this fix. A separate,
// pre-existing fixture-matching rule (date-only match in matchCompetitionToFixture)
// may still auto-tag a same-day event as GOY-eligible by date alone; that behavior
// is unrelated to this fix and intentionally not asserted on here.

const r4 = loadCsv(unrelatedReport, 'Ladies August Stableford Trophy - Competition Report.csv');
assert.ok(!r4.error, 'unrelated report should parse without error: ' + JSON.stringify(r4));

competitions = run('appState.competitions');
visible = competitions.filter(c => !c.hidden);
augustMedalRows = visible.filter(c => (c.info.name || '').toLowerCase().includes('august medal'));
assert.strictEqual(augustMedalRows.length, 1,
    'August Medal should still be exactly one visible row after the unrelated report loads');
assert.strictEqual(augustMedalRows[0].id, medal.id, 'August Medal row identity should be unchanged');
assert.strictEqual((augustMedalRows[0].mergedCompetitionIds || []).length, 1,
    'August Medal row should still have exactly one folded duplicate (not the unrelated competition)');

const unrelated = visible.find(c => (c.info.name || '').toLowerCase().includes('ladies august stableford'));
assert.ok(unrelated, 'unrelated Ladies competition should be its own visible row');
assert.notStrictEqual(unrelated.id, medal.id, 'unrelated competition must not be folded into the August Medal row');
assert.ok(!(augustMedalRows[0].mergedCompetitionIds || []).includes(unrelated.id),
    'unrelated competition must not be listed as a fold of the August Medal row');

run('renderCompetitionsTable()');
assert.strictEqual(competitionsTbody.children.length, 2,
    'Loaded Competitions table should render 2 rows (August Medal + unrelated Ladies row), got ' +
    competitionsTbody.children.length);

console.log('All August Medal merge regression assertions passed.');
console.log('Visible competitions after load: ' + visible.map(c => c.info.name + ' [' + c.info.date + ']').join(' | '));

