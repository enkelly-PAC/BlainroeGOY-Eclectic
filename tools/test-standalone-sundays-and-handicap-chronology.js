// Regression tests for:
//   1. Latest-date extraction (extractLatestDateKey uses the LAST actual date
//      in a multi-day competition, not the first).
//   2. Handicap chronology in calculateEclecticFromScorecards uses the latest
//      played date per competition (not first date, not import order), and
//      resolves same-date ties deterministically.
//   3. Duplicate scorecard re-import does not double count rounds.
//   4. A report and its scorecard(s) for one competition merge as
//      complementary data even when the report's own name field is a
//      mislabelled export artefact sharing no keyword tokens with the
//      scorecards (the real "Singles Stableford Whites" 30 August case).
//   5. The five standalone Sunday Singles Stableford dates (31 May, 21 June,
//      5 July, 26 July, 23 August) classify as Eclectic-only (isGOY false,
//      isEclectic true), and the 26 July date collision with the Captain's
//      Prize Final (GOY, double points, same calendar date) resolves
//      correctly for both events.
//
// Run with: node tools\test-standalone-sundays-and-handicap-chronology.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const repoRoot = path.join(__dirname, '..');
const fixturesSrc = fs.readFileSync(path.join(repoRoot, 'js', 'fixtures.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(repoRoot, 'js', 'app.js'), 'utf8');

// ---- Minimal DOM / storage stubs (same pattern as the other tools/test-*.js files) ----

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

function makeSandbox() {
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
    const sandbox = { document: fakeDocument, window: {}, localStorage: fakeLocalStorage, console, Date };
    vm.createContext(sandbox);
    vm.runInContext(fixturesSrc, sandbox, { filename: 'fixtures.js' });
    vm.runInContext(appSrc, sandbox, { filename: 'app.js' });
    return sandbox;
}

function run(sandbox, code) {
    return vm.runInContext(code, sandbox);
}

function loadCsv(sandbox, text, filename) {
    return run(sandbox, `processUploadedFile(${JSON.stringify(text)}, ${JSON.stringify(filename)})`);
}

// ============================================================
// Test 1: extractLatestDateKey uses the LAST date in a multi-day string
// ============================================================
{
    const sandbox = makeSandbox();
    const single = run(sandbox, `extractLatestDateKey(${JSON.stringify('30 August 2026')})`);
    assert.strictEqual(single, '2026-08-30', 'single date should extract as-is');

    const multi = run(sandbox, `extractLatestDateKey(${JSON.stringify('Saturday 29 August 2026 and Sunday 30 August 2026')})`);
    assert.strictEqual(multi, '2026-08-30',
        'extractLatestDateKey should return the LAST date (30th), not the first (29th)');

    // Regression guard: extractDateKey (first date) must still return the first
    // date unchanged, since it is intentionally used for season-start filtering.
    const firstDate = run(sandbox, `extractDateKey(${JSON.stringify('Saturday 29 August 2026 and Sunday 30 August 2026')})`);
    assert.strictEqual(firstDate, '2026-08-29', 'extractDateKey should still return the first date (unchanged behaviour)');

    console.log('Test 1 passed: extractLatestDateKey resolves the last actual date in a multi-day string.');
}

// ============================================================
// Test 2: handicap chronology picks up the LATEST-dated competition's
// handicap, using the terminal 30 August report over an earlier one, even
// though the terminal competition's date string starts with an earlier day
// (29 August) than a single-day competition dated in between (23 August).
// ============================================================
{
    const sandbox = makeSandbox();
    const HEADER = 'Player,Hcp,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18';

    // Earlier competition (23 August): report gives the player handicap 14.
    const aug23Scorecard = [
        'Blainroe Golf Club', 'Competition Scorecards',
        "Hole by Hole scores returned in the Men's Singles Stableford competition round played on 23 August 2026 at Blainroe (Blainroe  Main)",
        HEADER,
        '"Murphy, Sean",14,5,4,4,5,5,4,4,3,4,4,4,4,4,4,3,4,3,5'
    ].join('\n');
    const aug23Report = [
        'Blainroe Golf Club', "Men's Singles Stableford",
        'Printed: 23 August 2026',
        'Competition Result',
        'Aggregate result of the Competition played on Sunday 23 August 2026 at Blainroe (Blainroe  Main).',
        'Aggregated Results - Net Scores',
        'Pos,Name,Category,Score',
        '1,"Murphy, Sean",Stableford,"36 pts    (14)"'
    ].join('\n');

    // Terminal competition (29/30 August "Whites"): report's own name is a
    // mislabelled artefact (real-world case), and it lowers the same
    // player's handicap to 11. Its date string starts with 29 August (earlier
    // than 23 August's single date is NOT the point here -- the point is the
    // LAST date, 30 August, must still win over 23 August's single date).
    const whitesAltDayScorecard = [
        'Blainroe Golf Club', 'Competition Scorecards',
        "Hole by Hole scores returned in the Men's Singles Stableford - Alt Day competition round played on 29 August 2026 at Blainroe (Blainroe  Main)",
        HEADER,
        '"Murphy, Sean",11,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,3,3'
    ].join('\n');
    const whitesSundayScorecard = [
        'Blainroe Golf Club', 'Competition Scorecards',
        "Hole by Hole scores returned in the Men's Singles Stableford competition round played on 30 August 2026 at Blainroe (Blainroe  Main)",
        HEADER,
        '"Murphy, Sean",11,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,3,3'
    ].join('\n');
    const whitesReport = [
        'Blainroe Golf Club', "Captain Hilary's Prize Back 9 Holes",
        'Printed: 31 August 2026',
        'Competition Result',
        'Aggregate result of the Competition played on Saturday 29 August 2026 and Sunday 30 August 2026 at Blainroe (Blainroe  Main).',
        'Aggregated Results - Net Scores',
        'Pos,Name,Category,Score',
        '1,"Murphy, Sean",Stableford,"40 pts    (11)"'
    ].join('\n');

    // Load OUT OF chronological order (terminal Whites files first, then the
    // 23 August files) to prove the result depends on parsed competition
    // dates, not upload/array order.
    loadCsv(sandbox, whitesAltDayScorecard, 'Singles-Stableford-Autust--AltDay-Competition Scorecards.csv');
    loadCsv(sandbox, whitesSundayScorecard, 'Singles-Stableford-Autust-Competition-Sunday-Scorecards.csv');
    loadCsv(sandbox, whitesReport, "Competition Report (Aggregated Net Result) - Singles Stableford Whites - Sunday 30 August 2026.csv");
    loadCsv(sandbox, aug23Scorecard, 'Singles-Stableford-August-23-Sunday-Only-Comp-EclecticUpdate-Competition Scorecards.csv');
    loadCsv(sandbox, aug23Report, 'Competition Report (Aggregated Net Result) - Men\'s Singles Stableford - Sunday 23 August 2026.csv');

    const eclectic = run(sandbox, 'calculateEclecticFromScorecards()');
    const murphy = eclectic.players.find(p => p.name === 'Murphy, Sean');
    assert.ok(murphy, 'Murphy, Sean should appear in Eclectic');
    assert.strictEqual(murphy.handicap, 11,
        'Nett handicap should come from the terminal 30 August competition (11), not the earlier 23 August one (14), ' +
        'regardless of upload order');

    console.log('Test 2 passed: terminal 30 August competition supplies the Nett handicap over an earlier-dated one.');
}

// ============================================================
// Test 3: same-date ties are resolved deterministically (by competition name
// then filename), not by import/array order. Loading the same two same-dated
// competitions in reversed order must produce the same winning handicap both
// times.
// ============================================================
{
    const HEADER = 'Player,Hcp,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18';
    const scorecard = [
        'Blainroe Golf Club', 'Competition Scorecards',
        "Hole by Hole scores returned in the Men's Singles Stableford competition round played on 6 September 2026 at Blainroe (Blainroe  Main)",
        HEADER,
        '"Murphy, Sean",10,5,4,4,5,5,4,4,3,4,4,4,4,4,4,3,4,3,5'
    ].join('\n');

    // Two distinct, same-dated reports with different handicaps for the same player.
    const reportA = [
        'Blainroe Golf Club', 'Alpha Trophy',
        'Printed: 6 September 2026',
        'Competition Result',
        'Aggregate result of the Competition played on Sunday 6 September 2026 at Blainroe (Blainroe  Main).',
        'Aggregated Results - Net Scores',
        'Pos,Name,Category,Score',
        '1,"Murphy, Sean",Stableford,"36 pts    (10)"'
    ].join('\n');
    const reportB = [
        'Blainroe Golf Club', 'Beta Trophy',
        'Printed: 6 September 2026',
        'Competition Result',
        'Aggregate result of the Competition played on Sunday 6 September 2026 at Blainroe (Blainroe  Main).',
        'Aggregated Results - Net Scores',
        'Pos,Name,Category,Score',
        '1,"Murphy, Sean",Stableford,"36 pts    (13)"'
    ].join('\n');

    function loadOrderAndGetHandicap(firstReport, firstName, secondReport, secondName) {
        const sandbox = makeSandbox();
        loadCsv(sandbox, scorecard, 'Scratch-Only-Scorecard.csv');
        loadCsv(sandbox, firstReport, firstName);
        loadCsv(sandbox, secondReport, secondName);
        const eclectic = run(sandbox, 'calculateEclecticFromScorecards()');
        return eclectic.players.find(p => p.name === 'Murphy, Sean').handicap;
    }

    const forwardOrder = loadOrderAndGetHandicap(reportA, 'Alpha-Report.csv', reportB, 'Beta-Report.csv');
    const reverseOrder = loadOrderAndGetHandicap(reportB, 'Beta-Report.csv', reportA, 'Alpha-Report.csv');

    assert.strictEqual(forwardOrder, reverseOrder,
        'same-date tie-break must be deterministic: loading the two same-dated reports in either order ' +
        'must produce the same winning handicap, got ' + forwardOrder + ' vs ' + reverseOrder);
    // Deterministic secondary key is competition name; "Alpha Trophy" sorts
    // before "Beta Trophy", so Beta (the alphabetically later name) wins the tie.
    assert.strictEqual(forwardOrder, 13, 'the alphabetically later competition name ("Beta Trophy") should win the tie, got ' + forwardOrder);

    console.log('Test 3 passed: same-date handicap ties resolve deterministically regardless of upload order.');
}

// ============================================================
// Test 4: duplicate scorecard re-import does not double count rounds
// (same content re-uploaded under the SAME filename, simulating a repeated
// drop of an unchanged file).
// ============================================================
{
    const sandbox = makeSandbox();
    const HEADER = 'Player,Hcp,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18';
    const scorecard = [
        'Blainroe Golf Club', 'Competition Scorecards',
        "Hole by Hole scores returned in the Men's Singles Stableford competition round played on 5 July 2026 at Blainroe (Blainroe  Main)",
        HEADER,
        '"Murphy, Sean",12,5,4,4,5,5,4,4,3,4,4,4,4,4,4,3,4,3,5'
    ].join('\n');
    const report = [
        'Blainroe Golf Club', "Men's Singles Stableford",
        'Printed: 5 July 2026',
        'Competition Result',
        'Aggregate result of the Competition played on Sunday 5 July 2026 at Blainroe (Blainroe  Main).',
        'Aggregated Results - Net Scores',
        'Pos,Name,Category,Score',
        '1,"Murphy, Sean",Stableford,"37 pts    (12)"'
    ].join('\n');

    loadCsv(sandbox, report, "Competition Report (Aggregated Net Result) - Men's Singles Stableford - Sunday 5 July 2026.csv");
    loadCsv(sandbox, scorecard, 'Singles-Stableford-Sunday-05-July-Sunday-Only-Eclectic-Update-Competition Scorecards.csv');
    // Repeated drop of the exact same file/content, twice more.
    loadCsv(sandbox, scorecard, 'Singles-Stableford-Sunday-05-July-Sunday-Only-Eclectic-Update-Competition Scorecards.csv');
    loadCsv(sandbox, scorecard, 'Singles-Stableford-Sunday-05-July-Sunday-Only-Eclectic-Update-Competition Scorecards.csv');

    const competitions = run(sandbox, 'appState.competitions');
    const visible = competitions.filter(c => !c.hidden);
    const julyRows = visible.filter(c => (c.info.date || '').includes('5 July 2026'));
    assert.strictEqual(julyRows.length, 1, 'repeated re-import of the identical scorecard must not create extra rows, got ' + julyRows.length);

    const eclectic = run(sandbox, 'calculateEclecticFromScorecards()');
    const murphy = eclectic.players.find(p => p.name === 'Murphy, Sean');
    assert.ok(murphy, 'Murphy, Sean should appear in Eclectic');
    assert.strictEqual(murphy.rounds, 1, 'repeated re-import of the identical scorecard must not inflate rounds played, got ' + murphy.rounds);
    assert.strictEqual(murphy.gross, 73, 'gross total should be unaffected by repeated re-import, got ' + murphy.gross);

    console.log('Test 4 passed: repeated re-import of an unchanged scorecard does not double count rounds.');
}

// ============================================================
// Test 5: report + scorecards for the 30 August "Singles Stableford Whites"
// competition merge as ONE competition despite the report's mislabelled name
// field sharing no keyword tokens with either scorecard's generic name.
// ============================================================
{
    const sandbox = makeSandbox();
    const HEADER = 'Player,Hcp,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18';

    const altDayScorecard = [
        'Blainroe Golf Club', 'Competition Scorecards',
        "Hole by Hole scores returned in the Men's Singles Stableford - Alt Day competition round played on 29 August 2026 at Blainroe (Blainroe  Main)",
        HEADER,
        '"Murphy, Sean",12,5,4,4,5,5,4,4,3,4,4,4,4,4,4,3,4,3,5'
    ].join('\n');
    const sundayScorecard = [
        'Blainroe Golf Club', 'Competition Scorecards',
        "Hole by Hole scores returned in the Men's Singles Stableford competition round played on 30 August 2026 at Blainroe (Blainroe  Main)",
        HEADER,
        '"Murphy, Sean",12,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,3,3'
    ].join('\n');
    // Mislabelled report name (real-world artefact), no shared keyword tokens
    // with either scorecard name above.
    const whitesReport = [
        'Blainroe Golf Club', "Captain Hilary's Prize Back 9 Holes",
        'Printed: 31 August 2026',
        'Competition Result',
        'Aggregate result of the Competition played on Saturday 29 August 2026 and Sunday 30 August 2026 at Blainroe (Blainroe  Main).',
        'Aggregated Results - Net Scores',
        'Pos,Name,Category,Score',
        '1,"Murphy, Sean",Stableford,"40 pts    (12)"'
    ].join('\n');

    loadCsv(sandbox, altDayScorecard, 'Singles-Stableford-Autust--AltDay-Competition Scorecards.csv');
    loadCsv(sandbox, sundayScorecard, 'Singles-Stableford-Autust-Competition-Sunday-Scorecards.csv');
    loadCsv(sandbox, whitesReport, 'Competition Report (Aggregated Net Result) - Singles Stableford Whites - Sunday 30 August 2026.csv');

    const competitions = run(sandbox, 'appState.competitions');
    const visible = competitions.filter(c => !c.hidden);
    const whitesRows = visible.filter(c => {
        const keys = run(sandbox, `extractAllDateKeys(${JSON.stringify(c.info.date)})`);
        return keys.includes('2026-08-29') || keys.includes('2026-08-30');
    });
    assert.strictEqual(whitesRows.length, 1,
        'the mismatched-name report and its two scorecards should merge into ONE visible competition, got ' + whitesRows.length +
        ' (' + JSON.stringify(visible.map(c => c.info.name)) + ')');

    const whites = whitesRows[0];
    assert.strictEqual(whites.hasReport, true, 'merged Whites competition should have the report attached');
    assert.strictEqual(whites.config.isGOY, false, 'Whites should not count towards GOY');
    assert.strictEqual(whites.config.isEclectic, true, 'Whites should count towards Eclectic');

    const eclectic = run(sandbox, 'calculateEclecticFromScorecards()');
    const murphy = eclectic.players.find(p => p.name === 'Murphy, Sean');
    assert.ok(murphy, 'Murphy, Sean should appear in Eclectic with both Whites rounds merged');
    assert.strictEqual(murphy.rounds, 2, 'both Alt Day and Sunday Whites rounds should be counted, got ' + murphy.rounds);
    assert.strictEqual(murphy.handicap, 12, 'handicap should come from the merged Whites report');

    console.log('Test 5 passed: report + scorecards for Whites (mismatched report name) merge into one competition.');
}

// ============================================================
// Test 6: the five standalone Sunday dates classify as Eclectic-only, and
// the 26 July date collision with the Captain's Prize Final (GOY, isCaptains)
// resolves correctly for BOTH events.
// ============================================================
{
    const sandbox = makeSandbox();

    const standaloneSundayDates = [
        ['31 May 2026', 'Men\'s Singles Stableford'],
        ['21 June 2026', 'Men\'s Singles Stableford'],
        ['5 July 2026', 'Men\'s Singles Stableford'],
        ['26 July 2026', 'Men\'s Singles Stableford'],
        ['23 August 2026', 'Men\'s Singles Stableford']
    ];
    for (const [dateStr, name] of standaloneSundayDates) {
        const match = run(sandbox, `matchCompetitionToFixture(${JSON.stringify(name)}, ${JSON.stringify('Sunday ' + dateStr)})`);
        assert.ok(match, 'standalone Sunday ' + dateStr + ' should resolve to a fixture');
        assert.strictEqual(match.isGOY, false, dateStr + ' must not count towards GOY, got isGOY=' + match.isGOY);
        assert.strictEqual(match.isEclectic, true, dateStr + ' must count towards Eclectic, got isEclectic=' + match.isEclectic);
        assert.strictEqual(match.isCaptains, false, dateStr + ' must not be flagged as Captains, got isCaptains=' + match.isCaptains);
    }

    // The real Captain's Prize Final, same calendar date (26 July), must still
    // resolve correctly as GOY + Captains (double points) via its keyword,
    // completely unaffected by the standalone Sunday fixture sharing its date.
    const captainsMatch = run(sandbox,
        `matchCompetitionToFixture(${JSON.stringify("Captain's Prize to Men (GOY)")}, ${JSON.stringify('Sunday 26 July 2026')})`);
    assert.ok(captainsMatch, "Captain's Prize Final should resolve to a fixture");
    assert.strictEqual(captainsMatch.isGOY, true, "Captain's Prize Final must count towards GOY");
    assert.strictEqual(captainsMatch.isCaptains, true, "Captain's Prize Final must be flagged as Captains (double points)");
    assert.strictEqual(captainsMatch.isEclectic, false, "Captain's Prize Final must not count towards Eclectic");
    assert.notStrictEqual(captainsMatch.fixture, standaloneSundayDates && run(sandbox,
        `matchCompetitionToFixture(${JSON.stringify("Men's Singles Stableford")}, ${JSON.stringify('Sunday 26 July 2026')})`).fixture,
        "Captain's Prize Final and the standalone 26 July round must resolve to two DIFFERENT fixtures");

    console.log("Test 6 passed: standalone Sundays are Eclectic-only and the 26 July date collision with Captain's Prize Final resolves correctly for both.");
}

console.log('\nAll standalone-Sunday / handicap-chronology regression assertions passed.');
