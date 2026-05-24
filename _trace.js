const fs = require('fs');
const vm = require('vm');

// Stub DOM with a Proxy that returns a self-stub for any access
const stubElement = new Proxy({}, {
    get(t, p) {
        if (p === Symbol.iterator) return undefined;
        if (p === 'length') return 0;
        if (p === 'classList') return { add: ()=>{}, remove: ()=>{}, toggle: ()=>{}, contains: ()=>false };
        if (p === 'style') return {};
        if (p === 'children' || p === 'childNodes') return [];
        if (p === 'value' || p === 'innerHTML' || p === 'textContent' || p === 'innerText') return '';
        if (p === 'checked' || p === 'disabled' || p === 'hidden') return false;
        if (p === 'dataset') return {};
        return typeof t[p] === 'function' ? t[p] : (function() { return stubElement; });
    },
    set() { return true; }
});
const stubDocument = {
    getElementById: () => stubElement,
    querySelector: () => stubElement,
    querySelectorAll: () => [],
    createElement: () => stubElement,
    addEventListener: () => {},
    body: stubElement,
    documentElement: stubElement,
};
const ctx = {
    console,
    document: stubDocument,
    window: {},
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    alert: () => {},
    Element: function() {},
    Node: function() {},
    HTMLElement: function() {},
};
vm.createContext(ctx);

vm.runInContext(fs.readFileSync('js/fixtures.js','utf8').replace(/^const /gm,'var '), ctx);
vm.runInContext(fs.readFileSync('js/preloaded-data.js','utf8').replace(/^const /gm,'var '), ctx);

let appSrc = fs.readFileSync('js/app.js','utf8').replace(/^const /gm,'var ');
// strip DOMContentLoaded handler (we'll run the loop manually)
appSrc = appSrc.replace(/document\.addEventListener\('DOMContentLoaded'[\s\S]*?\}\);\s*$/m, '// stripped');

try {
    vm.runInContext(appSrc, ctx);
} catch (e) {
    console.error('Load error:', e.message);
    process.exit(1);
}

ctx.appState = { competitions: [], eclecticData: null };
for (const file of ctx.PRELOADED_CSV_FILES) {
    try { ctx.processUploadedFile(file.content, file.filename); }
    catch (e) { console.log('Process failed for', file.filename, ':', e.message); }
}

console.log(`\n[COMPETITIONS LOADED] ${ctx.appState.competitions.length}\n`);
for (const c of ctx.appState.competitions) {
    const cards = c.scorecards || {};
    const krKey = Object.keys(cards).find(n => n.toLowerCase().includes('kieran') || n.toLowerCase().includes('ryan, k'));
    const krScores = krKey ? cards[krKey] : null;
    console.log(`  [${c.fixtureMatch || 'NO-FIX'}] "${(c.info.name||'').substring(0,55)}" d="${c.info.date}"`);
    console.log(`     hasR=${c.hasReport} hasS=${c.hasScorecard} isE=${c.config.isEclectic} cards=${Object.keys(cards).length}`);
    if (krKey) console.log(`     KIERAN key="${krKey}" scores=[${krScores.join(',')}] H16=${krScores[15]}`);
    else console.log(`     KIERAN: not in this comp's scorecards`);
}

const ecl = ctx.calculateEclecticFromScorecards();
if (!ecl) { console.log('\nNo eclectic data'); process.exit(0); }

// Find handicap lookup for Kieran across all comps
console.log(`\n[KIERAN HANDICAP LOOKUP]`);
for (const c of ctx.appState.competitions) {
    const krH = Object.keys(c.handicaps||{}).find(n => n.toLowerCase().includes('kieran') && n.toLowerCase().includes('ryan'));
    if (krH) console.log(`  ${c.info.name.substring(0,40)} -> handicap['${krH}'] = ${c.handicaps[krH]}`);
}

const kr = ecl.players.find(p => p.name.toLowerCase().includes('kieran') && p.name.toLowerCase().includes('ryan'));
console.log(`\n[KIERAN RYAN ECLECTIC]`);
if (!kr) {
    console.log('  NOT in eclectic players');
    // why? show all players starting with R or containing kieran
    const candidates = ecl.players.filter(p => p.name.toLowerCase().includes('kieran') || p.name.toLowerCase().includes('ryan'));
    console.log(`  Candidates in players: ${candidates.length}`);
    candidates.slice(0,10).forEach(p => console.log(`    "${p.name}" gross=${p.gross} h${p.handicap}`));
    process.exit(0);
}
console.log(`  Name="${kr.name}" Hcap=${kr.handicap} Rounds=${kr.rounds} Gross=${kr.gross}`);
console.log(`  Scores: ${kr.scores.join(' ')}`);
console.log(`  H16 = ${kr.scores[15]} (par 4; 3 = birdie)`);
