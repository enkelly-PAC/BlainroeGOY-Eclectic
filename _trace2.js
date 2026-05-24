const fs = require('fs');
const vm = require('vm');
const stubElement = new Proxy({}, { get(t,p){return typeof t[p]==='function'?t[p]:(()=>stubElement);}, set(){return true;}});
const stubDocument = {getElementById:()=>stubElement, querySelector:()=>stubElement, querySelectorAll:()=>[], createElement:()=>stubElement, addEventListener:()=>{}, body:stubElement, documentElement:stubElement};
const ctx = {console,document:stubDocument,window:{},localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},alert:()=>{}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('js/fixtures.js','utf8').replace(/^const /gm,'var '), ctx);
vm.runInContext(fs.readFileSync('js/preloaded-data.js','utf8').replace(/^const /gm,'var '), ctx);
let appSrc = fs.readFileSync('js/app.js','utf8').replace(/^const /gm,'var ');
appSrc = appSrc.replace(/document\.addEventListener\('DOMContentLoaded'[\s\S]*?\}\);\s*$/m,'// stripped');
vm.runInContext(appSrc, ctx);

const sun = ctx.PRELOADED_CSV_FILES.find(x => x.filename === 'Competition Scorecards-LadyCaptains-Sun.csv');
const parsed = ctx.parseScorecardCSV(sun.content);
console.log('Sun parser result:');
console.log('  info.name:', parsed.info.name);
console.log('  info.date:', parsed.info.date);
console.log('  scorecard count:', Object.keys(parsed.scorecards).length);
const krKey = Object.keys(parsed.scorecards).find(n => n.toLowerCase().includes('kieran'));
console.log('  Kieran key:', krKey);
if (krKey) {
    console.log('  Kieran scores:', parsed.scorecards[krKey].join(','));
    console.log('  H16 (idx 15):', parsed.scorecards[krKey][15]);
}

// Now Sat
const sat = ctx.PRELOADED_CSV_FILES.find(x => x.filename === 'Competition Scorecards-LadyCaptains-Sat.csv');
const parsedSat = ctx.parseScorecardCSV(sat.content);
console.log('\nSat parser result:');
console.log('  info.name:', parsedSat.info.name);
console.log('  info.date:', parsedSat.info.date);
console.log('  scorecard count:', Object.keys(parsedSat.scorecards).length);
const krKey2 = Object.keys(parsedSat.scorecards).find(n => n.toLowerCase().includes('kieran'));
console.log('  Kieran key:', krKey2 || 'NONE');
if (krKey2) {
    console.log('  Kieran scores:', parsedSat.scorecards[krKey2].join(','));
}

// Now report
const rep = ctx.PRELOADED_CSV_FILES.find(x => x.filename.startsWith('Competition Report') && x.filename.toLowerCase().includes('lady'));
const parsedRep = ctx.parseCompetitionReportCSV(rep.content);
console.log('\nReport parser result:');
console.log('  info.name:', parsedRep.info.name);
console.log('  info.date:', parsedRep.info.date);
console.log('  results:', parsedRep.results.length);
const krRep = parsedRep.results.find(r => r.playerName.toLowerCase().includes('kieran'));
console.log('  Kieran:', krRep);

// Full step-by-step pipeline for ALL files, tracking when Kieran's H16 changes
console.log('\n=== FULL PIPELINE — TRACKING KIERAN H16 IN LADY CAPTAIN COMP ===');
ctx.appState = { competitions: [], eclecticData: null };
let prevH16 = null;
for (const f of ctx.PRELOADED_CSV_FILES) {
    const result = ctx.processUploadedFile(f.content, f.filename);
    // Find Lady Cap comp
    const lady = ctx.appState.competitions.find(c => (c.info.name||'').toLowerCase().includes('lady'));
    const krS = lady && lady.scorecards && lady.scorecards['Ryan, Kieran'];
    const h16 = krS ? krS[15] : null;
    if (h16 !== prevH16) {
        console.log(`After ${f.filename}: Kieran H16 in Lady Cap = ${h16} (was ${prevH16}) cards=${lady ? Object.keys(lady.scorecards||{}).length : '-'}`);
        prevH16 = h16;
    }
}
console.log('\nFinal comps:', ctx.appState.competitions.length);
ctx.appState.competitions.forEach(c => console.log(`  [${c.fixtureMatch||'NO-FIX'}] "${(c.info.name||'').substring(0,55)}" cards=${Object.keys(c.scorecards||{}).length}`));
