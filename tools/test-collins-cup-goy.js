const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const storage = new Map();
let initialize;
const sandbox = {
    console,
    document: {
        addEventListener(event, callback) {
            if (event === 'DOMContentLoaded') initialize = callback;
        },
        createElement() {
            return {
                textContent: '',
                get innerHTML() {
                    return this.textContent.replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;').replace(/>/g, '&gt;');
                }
            };
        }
    },
    localStorage: {
        getItem(key) { return storage.get(key) || null; },
        setItem(key, value) { storage.set(key, value); },
        removeItem(key) { storage.delete(key); }
    }
};
vm.createContext(sandbox);
for (const file of ['fixtures.js', 'preloaded-data.js', 'goy-matchplay-data.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), sandbox);
}
const run = code => vm.runInContext(code, sandbox);
const json = code => JSON.parse(run(`JSON.stringify(${code})`));

assert.strictEqual(run(`matchCompetitionToFixture("Men's Singles Stableford", "25 October 2026")`), null);
assert.strictEqual(run(`matchCompetitionToFixture("Collins Cup", "25 October 2026").fixture.category`), 'Matchplay');

run(`
    for (const file of PRELOADED_CSV_FILES) {
        processUploadedFile(file.content, file.filename);
    }
`);
const before = json('calculateGOY()');
const eclecticBefore = json('calculateEclecticFromScorecards()');
run('loadPreloadedGOYCompetitions()');
const after = json('calculateGOY()');
const awards = json('PRELOADED_GOY_COMPETITIONS[0].results');
const baseline = new Map(before.leaderboard.map(p => [p.playerName, p]));
const expectedAwards = new Map(awards.map(p => [p.playerName, p.goyPoints]));
const pointsByPosition = new Map([[1, 20], [2, 19], [3, 18], [5, 15], [9, 9], [17, 1]]);
assert.strictEqual(awards.length, 32);
for (const award of awards) {
    assert(Number.isInteger(award.goyPoints), award.playerName);
    assert.strictEqual(award.goyPoints, pointsByPosition.get(award.position), award.playerName);
}

for (const player of after.leaderboard) {
    const previous = baseline.get(player.playerName);
    const award = expectedAwards.get(player.playerName) || 0;
    assert.strictEqual(player.total, (previous?.total || 0) + award, player.playerName);
    assert.strictEqual(player.compCount, (previous?.compCount || 0) + (award > 0 ? 1 : 0));
    if (previous) {
        for (const [compId, points] of Object.entries(previous.comps)) {
            assert.strictEqual(player.comps[compId], points);
        }
    }
}
assert.strictEqual(after.leaderboard.reduce((sum, p) => sum + p.total, 0)
    - before.leaderboard.reduce((sum, p) => sum + p.total, 0), 223);
assert.deepStrictEqual(json('calculateEclecticFromScorecards()'), eclecticBefore);
const rendered = run('renderGOYTable(calculateGOY())');
assert(rendered.includes('Competition winner, 20 GoY points'));
assert(rendered.includes('Scored 18 GoY points'));
assert(rendered.includes('Scored 1 GoY point'));
assert(!rendered.includes('17.5'));
assert(!rendered.includes('0.625'));
assert(!rendered.includes('TBC'));

// A returning browser must refresh the official awards, not duplicate them
// or discard a separately uploaded competition.
run(`
    appState.competitions.push({
        id: 'custom_upload', filename: 'custom.csv',
        info: { name: 'Custom competition', date: '', venue: '' },
        config: { isGOY: false, isEclectic: false, isCaptains: false },
        hasReport: false, hasScorecard: false, results: [], scorecards: {}, handicaps: {}
    });
    for (const result of appState.competitions.find(c => c.id === 'collins_cup_2026').results) {
        const oldPoints = { 1: 20, 2: 19, 3: 17.5, 5: 14.5, 9: 8.5, 17: 0.625 };
        result.goyPoints = oldPoints[result.position];
    }
    saveToStorage();
    appState.competitions = [];
    initUI = () => {};
    loadPalsFromStorage = () => {};
    initPalsSearch = () => {};
    renderCompetitionsTable = () => {};
    generateTables = () => { appState.goyResults = calculateGOY(); };
    renderFixtureTracker = () => {};
    renderEclecticTracker = () => {};
`);
initialize();
initialize();
assert.strictEqual(run('appState.competitions.filter(c => c.id === "collins_cup_2026").length'), 1);
assert.strictEqual(run('appState.competitions.filter(c => c.id === "custom_upload").length'), 1);
assert.strictEqual(run('appState.competitions.find(c => c.id === "collins_cup_2026").results[0].goyPoints'), 20);
assert.deepStrictEqual(json('calculateGOY()'), after);
assert.deepStrictEqual(json('calculateEclecticFromScorecards()'), eclecticBefore);

// Explicit shared awards remain valid past 20th place; the normal and
// Captain's Prize tables still exclude players outside their top 20.
run(`
    appState.competitions = [{
        id: 'normal', config: { isGOY: true, isCaptains: false }, hasReport: true,
        results: [
            { playerName: 'Normal winner', position: 1 },
            { playerName: 'Normal twentieth', position: 20 },
            { playerName: 'Outside top twenty', position: 21 },
            { playerName: 'Shared cutoff', position: 32, goyPoints: 1 }
        ]
    }, {
        id: 'captains', config: { isGOY: true, isCaptains: true }, hasReport: true,
        results: [{ playerName: 'Captain winner', position: 1 }]
    }];
`);
const edgePlayers = new Map(json('calculateGOY().leaderboard').map(p => [p.playerName, p.total]));
assert.strictEqual(edgePlayers.get('Normal winner'), 20);
assert.strictEqual(edgePlayers.get('Normal twentieth'), 1);
assert.strictEqual(edgePlayers.get('Shared cutoff'), 1);
assert.strictEqual(edgePlayers.get('Captain winner'), 40);
assert(!edgePlayers.has('Outside top twenty'));
console.log('PASS: Collins Cup whole-point awards, unchanged other events and Eclectic, fractional-cache migration, and top-20 regression.');
console.log('Updated GOY leaders:', after.leaderboard.slice(0, 5).map(p => `${p.playerName}: ${p.total}`).join('; '));
