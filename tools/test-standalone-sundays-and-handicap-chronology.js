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

// ============================================================
// Test 7: the 19 and 20 September weekend fixture is tracked as
// Eclectic-only and can never add GOY points.
// ============================================================
{
    const sandbox = makeSandbox();
    const match = run(sandbox,
        `matchCompetitionToFixture(${JSON.stringify("Men's Weekend - Singles Stableford - 19th/20th September 2026")}, ${JSON.stringify('Saturday 19 September 2026 & Sunday 20 September 2026')})`);
    assert.ok(match, '19 and 20 September weekend should resolve to a fixture');
    assert.strictEqual(match.isGOY, false, '19 and 20 September weekend must not count towards GOY');
    assert.strictEqual(match.isEclectic, true, '19 and 20 September weekend must count towards Eclectic');
    assert.strictEqual(match.isCaptains, false, '19 and 20 September weekend must not be flagged as Captains');

    console.log('Test 7 passed: 19 and 20 September weekend is tracked as Eclectic-only.');
}

// ============================================================
// Test 8: the 26 and 27 September weekend fixture is tracked as
// Eclectic-only without sharing dates with the October Medal.
// ============================================================
{
    const sandbox = makeSandbox();
    const stablefordMatch = run(sandbox,
        `matchCompetitionToFixture(${JSON.stringify("Men's Singles Stableford")}, ${JSON.stringify('Saturday 26 September 2026 and Sunday 27 September 2026')})`);
    assert.ok(stablefordMatch, '26 and 27 September weekend should resolve to a fixture');
    assert.strictEqual(stablefordMatch.isGOY, false, '26 and 27 September weekend must not count towards GOY');
    assert.strictEqual(stablefordMatch.isEclectic, true, '26 and 27 September weekend must count towards Eclectic');
    assert.strictEqual(stablefordMatch.isCaptains, false, '26 and 27 September weekend must not be flagged as Captains');

    const octoberMedalMatch = run(sandbox,
        `matchCompetitionToFixture(${JSON.stringify("Men's October Medal")}, ${JSON.stringify('Saturday 3 October 2026 and Sunday 4 October 2026')})`);
    assert.ok(octoberMedalMatch, "Men's October Medal should resolve to a fixture");
    assert.strictEqual(octoberMedalMatch.isGOY, true, "Men's October Medal must count towards GOY");
    assert.strictEqual(octoberMedalMatch.isEclectic, true, "Men's October Medal must count towards Eclectic");
    assert.notStrictEqual(stablefordMatch.fixture, octoberMedalMatch.fixture,
        'the September Stableford and October Medal must resolve to different fixtures');

    console.log('Test 8 passed: 26 and 27 September is Eclectic-only and does not duplicate the October Medal dates.');
}

// ============================================================
// Test 9: non-GOY Singles Stableford fixtures and loaded rows use
// the same date-based display name format.
// ============================================================
{
    const sandbox = makeSandbox();
    const fixtureNames = run(sandbox,
        `GOY_FIXTURES.competitions
            .filter(fixture => fixture.isGOY === false && fixture.category === 'Singles Stableford')
            .map(fixture => fixture.name)`);

    for (const name of fixtureNames) {
        assert.match(name, /^Men's Singles Stableford \(.+\)$/,
            'non-GOY Singles Stableford fixture must use the canonical date-based name: ' + name);
    }

    const augustDisplayName = run(sandbox,
        `competitionDisplayName({
            info: { name: "Captain Hilary's Prize Back 9 Holes" },
            filename: "august.csv",
            fixtureMatch: "Men's Singles Stableford (29 and 30 August)",
            config: { isGOY: false }
        })`);
    assert.strictEqual(augustDisplayName, "Men's Singles Stableford (29 and 30 August)",
        'mislabelled source exports should display the canonical fixture name');

    const septemberDisplayName = run(sandbox,
        `competitionDisplayName({
            info: { name: "Men's Singles Stableford" },
            filename: "september.csv",
            fixtureMatch: "Men's Singles Stableford (26 and 27 September)",
            config: { isGOY: false }
        })`);
    assert.strictEqual(septemberDisplayName, "Men's Singles Stableford (26 and 27 September)",
        'generic source exports should display the canonical fixture name');

    console.log('Test 9 passed: non-GOY Singles Stableford names are canonical and date-based.');
}

// ============================================================
// Test 10: scorecard-only days from the same reviewed fixture merge
// and display with the canonical fixture name and date range.
// ============================================================
{
    const sandbox = makeSandbox();
    const HEADER = 'Player,Hcp,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18';
    const altDayScorecard = [
        'Blainroe Golf Club', 'Competition Scorecards',
        "Hole by Hole scores returned in the Men's Singles Stableford - Alt Day competition round played on 1 August 2026 at Blainroe (Blainroe Main)",
        HEADER,
        '"Murphy, Sean",12,5,4,4,5,5,4,4,3,4,4,4,4,4,4,3,4,3,5'
    ].join('\n');
    const sundayScorecard = [
        'Blainroe Golf Club', 'Competition Scorecards',
        "Hole by Hole scores returned in the Men's Singles Stableford competition round played on 2 August 2026 at Blainroe (Blainroe Main)",
        HEADER,
        '"Murphy, Sean",12,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,3,3'
    ].join('\n');

    loadCsv(sandbox, altDayScorecard, 'SinglesStableford-1st-August-2026-AltDay-Competition Scorecards.csv');
    loadCsv(sandbox, sundayScorecard, 'SinglesStableford-2nd-August-2026-Sunday-Competition Scorecards.csv');

    const visible = run(sandbox, 'appState.competitions.filter(comp => !comp.hidden)');
    assert.strictEqual(visible.length, 1, 'the 1 and 2 August scorecards should merge into one loaded competition');
    assert.strictEqual(visible[0].fixtureMatch, "Men's Singles Stableford (1 and 2 August)",
        'the merged August competition should retain its canonical fixture match');

    const displayName = run(sandbox, 'competitionDisplayName(appState.competitions.find(comp => !comp.hidden))');
    const displayDate = run(sandbox, 'competitionDisplayDate(appState.competitions.find(comp => !comp.hidden))');
    assert.strictEqual(displayName, "Men's Singles Stableford (1 and 2 August)");
    assert.strictEqual(displayDate, 'Saturday 1 August 2026 & Sunday 2 August 2026');
    const underlyingRounds = run(sandbox,
        `appState.competitions.filter(comp => Object.prototype.hasOwnProperty.call(comp.scorecards, 'Murphy, Sean')).length`);
    assert.strictEqual(underlyingRounds, 2, 'both underlying August rounds must remain stored separately');

    console.log('Test 10 passed: scorecard-only fixture days merge and display canonically.');
}

// ============================================================
// Test 11: the Collins Cup is a date-TBC GOY placeholder and is
// excluded from Eclectic calculations.
// ============================================================
{
    const sandbox = makeSandbox();
    const match = run(sandbox,
        `matchCompetitionToFixture(${JSON.stringify('Collins Cup Singles Matchplay')}, ${JSON.stringify('Final result')})`);
    assert.ok(match, 'Collins Cup should resolve by keyword');
    assert.strictEqual(match.isGOY, true, 'Collins Cup must count towards GOY');
    assert.strictEqual(match.isEclectic, false, 'Collins Cup must not count towards Eclectic');

    const calendarEntry = run(sandbox,
        `getFixtureCalendar([]).find(fixture => fixture.name === 'Collins Cup (Singles Matchplay)')`);
    assert.ok(calendarEntry, 'Collins Cup placeholder should appear in the fixture calendar');
    assert.strictEqual(calendarEntry.dates.length, 0, 'Collins Cup date should remain TBC');
    assert.strictEqual(calendarEntry.isPast, false, 'date-TBC Collins Cup must not be marked missed');
    assert.strictEqual(calendarEntry.isCurrent, false, 'date-TBC Collins Cup must not be marked current');
    assert.strictEqual(calendarEntry.isUpcoming, true, 'date-TBC Collins Cup should be upcoming');

    const columnName = run(sandbox, `goyFixtureColumnName(
        GOY_FIXTURES.competitions.find(fixture => fixture.name === 'Collins Cup (Singles Matchplay)')
    )`);
    assert.strictEqual(columnName, 'Collins Cup (Singles Matchplay)',
        'GOY table should use the full Collins Cup placeholder name');
    const goyHtml = run(sandbox, `renderGOYTable({ leaderboard: [], competitions: [] })`);
    assert.ok(goyHtml.includes('TBC'),
        'GOY table should show TBC for the Collins Cup placeholder date');

    console.log('Test 11 passed: Collins Cup is a date-TBC GOY-only placeholder.');
}

// ============================================================
// Test 12: the Nett table displays hole-level nett scores and nett
// subtotals, while retaining gross context in tooltips and summary.
// ============================================================
{
    const sandbox = makeSandbox();
    const scores = new Array(18).fill(4);
    const player = {
        name: 'Test Player',
        rounds: 3,
        scores,
        gross: 72,
        handicap: 18,
        handicapDisplay: '18',
        net: 54,
        back9Net: 27,
        back6Net: 18,
        back3Net: 9,
        lastHoleNet: 3
    };
    const html = run(sandbox,
        `renderEclecticNettTable({ year: '2026', players: [${JSON.stringify(player)}] })`);

    assert.ok(html.includes('Hole scores are nett'),
        'Nett table should explain that hole values are nett');
    assert.ok(html.includes('title="Gross 4, 1 handicap stroke, Nett 3"'),
        'Nett hole cells should expose gross score and stroke allowance');
    assert.ok(html.includes('>3</td>'),
        'Nett hole cells should display the nett score');
    assert.ok(html.includes('<td class="total-cell">27</td>'),
        'Out and In subtotals should be nett totals');
    assert.ok(html.includes('<td class="total-cell">72</td>'),
        'The Gross summary column should remain visible');
    assert.ok(html.includes('<td>18</td>'),
        'The handicap summary column should remain visible');
    assert.ok(html.includes('<td class="total-cell">54</td>'),
        'The Net summary column should remain visible');

    console.log('Test 12 passed: Nett table displays nett holes with gross context.');
}

// ============================================================
// Test 13: non-zero GoY event cells receive subtle scoring emphasis,
// while zero-point cells remain neutral.
// ============================================================
{
    const sandbox = makeSandbox();
    const results = {
        leaderboard: [{
            playerName: 'Test Player',
            total: 14,
            compCount: 1,
            position: 1,
            comps: { march: 14 }
        }],
        competitions: [{
            id: 'march',
            info: { name: "Men's March Medal (GOY)" }
        }]
    };
    const html = run(sandbox, `renderGOYTable(${JSON.stringify(results)})`);

    assert.ok(html.includes('class="comp-col goy-scored" title="Scored 14 GoY points">14</td>'),
        'a non-zero GoY result should receive the scoring highlight and tooltip');
    assert.ok(html.includes('class="comp-col">0</td>'),
        'zero-point GoY cells should remain neutral');

    console.log('Test 13 passed: GoY scoring cells are subtly highlighted.');
}

console.log('\nAll standalone-Sunday / handicap-chronology regression assertions passed.');
