// ============================================================
// Blainroe Golf Club - GOY & Eclectic Cup Application
// ============================================================

// ============ COURSE DATA ============
const COURSE = {
    name: "Blainroe Golf Club",
    holes: 18,
    par:  [4, 4, 4, 5, 5, 4, 4, 3, 4,  4, 4, 4, 4, 4, 3, 4, 3, 5],
    si:   [12,2, 4,18,14, 6,10, 8,16,  7,11, 3, 9,13, 5, 1,17,15],
    get outPar() { return this.par.slice(0,9).reduce((a,b)=>a+b, 0); },
    get inPar()  { return this.par.slice(9).reduce((a,b)=>a+b, 0); },
    get totalPar() { return this.par.reduce((a,b)=>a+b, 0); }
};

// ============ GOY POINTS ============
const GOY_POINTS_NORMAL = [];
const GOY_POINTS_CAPTAINS = [];
for (let i = 0; i < 20; i++) {
    GOY_POINTS_NORMAL[i] = 20 - i;
    GOY_POINTS_CAPTAINS[i] = (20 - i) * 2;
}

// ============ APP STATE ============
const appState = {
    competitions: [],
    goyResults: null,
    eclecticData: null,
    pals: []
};

// ============ BUDDY BATTLE ============
const PALS_STORAGE_KEY = 'blainroe_pals';
const MAX_PALS = 8;

// ============ CSV PARSING ============

function parseCSVLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (i + 1 < line.length && line[i+1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                fields.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
    }
    fields.push(current.trim());
    return fields;
}

function parseCSVLines(text) {
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
               .map(l => l.trim()).filter(l => l.length > 0);
}

function normalizePlayerName(name) {
    return name.replace(/\s+/g, ' ').trim();
}

function normalizeDisplayText(text) {
    if (!text) return '';
    return text
        .replace(/([A-Za-z])\uFFFDs\b/g, "$1's")
        .replace(/([A-Za-z])\u00E2\u20AC\u2122s\b/g, "$1's");
}

function displayName(name) {
    if (!name) return '';
    const parts = name.split(',');
    if (parts.length === 2) return parts[1].trim() + ' ' + parts[0].trim();
    return name;
}

// ============ CSV TYPE DETECTION ============

function detectCSVType(text) {
    if (text.includes('Fewest strokes taken on each hole')) {
        return 'eclectic';
    }
    if (text.includes('Competition Scorecards') || text.includes('Hole by Hole scores')) {
        return 'scorecards';
    }
    if (text.includes('Competition Result') || text.includes('Aggregated Results')) {
        return 'report';
    }
    return 'unknown';
}

// ============ COMPETITION INFO EXTRACTION ============

function extractCompetitionInfo(lines) {
    let name = '';
    let date = '';
    let venue = '';
    for (let i = 0; i < Math.min(10, lines.length); i++) {
        const fields = parseCSVLine(lines[i]);
        const text = fields.join(' ').trim();
        if (i === 1 && fields[0] && !fields[0].includes('Printed')) {
            name = fields[0];
            const dateMatch = name.match(/(\d{1,2}(?:st|nd|rd|th)?\s*[\/&]\s*\d{1,2}(?:st|nd|rd|th)?\s+\w+\s+\d{4})/i);
            if (dateMatch) date = dateMatch[1];
        }
        // Scorecard CSVs put a generic "Competition Scorecards" on line 2 and the rich
        // comp name embedded in line 4, e.g. "Hole by Hole scores returned in the
        // [COMP NAME] competition round played on [DATE] at [VENUE]". When the line-2
        // name is the generic placeholder, prefer the richer name so fixture matching
        // and merge logic have something useful to work with.
        if ((!name || name === 'Competition Scorecards') && /Hole by Hole/i.test(text)) {
            const richMatch = text.match(/Hole by Hole scores returned in the\s+(.+?)\s+competition round/i);
            if (richMatch) name = richMatch[1].trim();
        }
        if (text.includes('played on')) {
            const playedMatch = text.match(/played on\s+(.+?)\s+at\s+(.+)/i);
            if (playedMatch) { date = playedMatch[1].trim(); venue = playedMatch[2].trim(); }
        }
        if (text.includes('Competition played on')) {
            const playedMatch = text.match(/played on\s+(.+?)\s+(?:and\s+(.+?)\s+)?at\s+(.+)/i);
            if (playedMatch) {
                date = playedMatch[1].trim();
                if (playedMatch[2]) date += ' & ' + playedMatch[2].trim();
                venue = (playedMatch[3] || '').trim();
            }
        }
    }
    return {
        name: normalizeDisplayText(name),
        date: normalizeDisplayText(date),
        venue: normalizeDisplayText(venue)
    };
}

// ============ SCORECARD PARSING ============

function parseScorecardCSV(text) {
    const lines = parseCSVLines(text);
    const info = extractCompetitionInfo(lines);
    const scorecards = {};
    let summaryStart = -1;
    for (let i = 0; i < lines.length; i++) {
        const fields = parseCSVLine(lines[i]);
        if (fields[0] && fields[0].includes('Player')) { summaryStart = i; break; }
    }
    if (summaryStart < 0) return { info, scorecards, error: 'Could not find scorecard summary header' };
    for (let i = summaryStart + 1; i < lines.length; i++) {
        const fields = parseCSVLine(lines[i]);
        if (fields.length < 20) break;
        if (fields[0] === '' && fields[1] === '' && fields[2] === '') break;
        if (fields[0].includes('Competition Scorecard')) break;
        const playerName = normalizePlayerName(fields[0]);
        if (!playerName) continue;
        const scores = [];
        for (let h = 0; h < 18; h++) {
            const val = fields[h + 2];
            const num = parseInt(val, 10);
            if (!isNaN(num) && num > 0) { scores.push(num); }
            else { scores.push(null); }
        }
        scorecards[playerName] = scores;
    }
    // Remove players with no valid scores (DQ, no-show)
    for (const name of Object.keys(scorecards)) {
        if (scorecards[name].every(s => s === null)) {
            delete scorecards[name];
        }
    }
    return { info, scorecards, handicaps: {} };
}

// ============ COMPETITION REPORT PARSING ============

function parseCompetitionReportCSV(text) {
    const lines = parseCSVLines(text);
    const info = extractCompetitionInfo(lines);
    const results = [];
    const handicaps = {};
    for (let i = 0; i < lines.length; i++) {
        const fields = parseCSVLine(lines[i]);
        const pos = parseInt(fields[0], 10);
        if (isNaN(pos) && fields[0] !== '-') continue;
        let playerName = normalizePlayerName(fields[1] || '');
        if (!playerName) continue;
        if (playerName.length > 50 || playerName.includes('Responsibility') ||
            playerName.includes('Rule') || playerName.includes('Description')) continue;
        let score = null, playingHandicap = null, scoreText = '';
        for (let f = 2; f < fields.length; f++) {
            const val = fields[f];
            if (!val) continue;
            // Stableford format: "39 pts (01)" or "39 (01)"
            const stablefordMatch = val.match(/(\d+)\s*(?:pts\.?)?\s*\((\d+)\)/);
            if (stablefordMatch) {
                score = parseInt(stablefordMatch[1], 10);
                playingHandicap = parseInt(stablefordMatch[2], 10);
                scoreText = val.trim();
                break;
            }
            // V PAR format: "7 up (09)", "Tied (13)", "1 down (07)"
            const vparUpMatch = val.match(/(\d+)\s*up\s*\((\d+)\)/i);
            if (vparUpMatch) {
                score = parseInt(vparUpMatch[1], 10);
                playingHandicap = parseInt(vparUpMatch[2], 10);
                scoreText = val.trim();
                break;
            }
            const vparTiedMatch = val.match(/Tied\s*\((\d+)\)/i);
            if (vparTiedMatch) {
                score = 0;
                playingHandicap = parseInt(vparTiedMatch[1], 10);
                scoreText = val.trim();
                break;
            }
            const vparDownMatch = val.match(/(\d+)\s*down\s*\((\d+)\)/i);
            if (vparDownMatch) {
                score = -parseInt(vparDownMatch[1], 10);
                playingHandicap = parseInt(vparDownMatch[2], 10);
                scoreText = val.trim();
                break;
            }
            // Medal/Strokeplay format: "88 - 19 = 69" (gross - handicap = net)
            const medalMatch = val.match(/(\d+)\s*-\s*(\d+)\s*=\s*(\d+)/);
            if (medalMatch) {
                score = parseInt(medalMatch[3], 10);  // net score
                playingHandicap = parseInt(medalMatch[2], 10);
                scoreText = val.trim();
                break;
            }
            // Medal/Strokeplay format for a plus handicap golfer: "70 + 04 = 74"
            // (gross + extra strokes = net). A plus handicap golfer gives strokes
            // back rather than receiving them, so it is stored here as a negative
            // number, matching the sign convention already used for "+" handicaps
            // parsed from dedicated Eclectic CSV exports elsewhere in this file
            // (see hcapVal.startsWith('+') below). Net = gross - handicap still
            // holds: 74 = 70 - (-4).
            const medalPlusMatch = val.match(/(\d+)\s*\+\s*(\d+)\s*=\s*(\d+)/);
            if (medalPlusMatch) {
                score = parseInt(medalPlusMatch[3], 10);  // net score
                playingHandicap = -parseInt(medalPlusMatch[2], 10);
                scoreText = val.trim();
                break;
            }
            if (val.includes('No Return') || val.includes('NR') || val.includes('DQ')) { scoreText = 'NR'; break; }
        }
        if (fields[0] === '-') continue;
        if (score === null && scoreText !== 'NR') continue;
        results.push({ position: pos, playerName, score, scoreText, playingHandicap });
        if (playingHandicap !== null) handicaps[playerName] = playingHandicap;
    }
    results.sort((a, b) => a.position - b.position);
    return { info, results, handicaps };
}

// ============ ECLECTIC CSV PARSING ============

function parseEclecticCSV(text) {
    const lines = parseCSVLines(text);
    let year = '';
    let printDate = '';

    // Extract header info
    for (let i = 0; i < Math.min(5, lines.length); i++) {
        const fields = parseCSVLine(lines[i]);
        const val = fields[0] || '';
        if (/^\d{4}$/.test(val)) year = val;
        if (val.startsWith('Printed:')) printDate = val;
    }

    // Find the header row with Position and hole numbers
    let headerIndex = -1;
    for (let i = 0; i < Math.min(10, lines.length); i++) {
        const fields = parseCSVLine(lines[i]);
        if (fields.some(f => f === 'Position') || fields.some(f => f === '(Rounds)')) {
            headerIndex = i;
            break;
        }
    }
    if (headerIndex < 0) return { error: 'Could not find eclectic header row' };

    const players = [];

    for (let i = headerIndex + 1; i < lines.length; i++) {
        const fields = parseCSVLine(lines[i]);
        if (fields.length < 22) break;

        const name = (fields[0] || '').trim();
        if (!name) break;
        if (name === 'Notes:' || name.startsWith('Number of scores')) break;

        const position = parseInt(fields[1], 10);
        if (isNaN(position)) break;

        const rounds = parseInt(fields[2], 10) || 0;

        const scores = [];
        for (let h = 0; h < 18; h++) {
            const val = fields[3 + h];
            const num = parseInt(val, 10);
            scores.push(!isNaN(num) && num > 0 ? num : null);
        }

        const grossVal = fields[21];
        const hcapVal = fields[22] || '';
        const netVal = fields[23] || '';
        const countback = (fields[25] || '').trim();

        // Parse handicap (handles "+1", "16", etc.)
        let handicap = null;
        if (hcapVal) {
            const hcpClean = hcapVal.replace('+', '');
            const hcpNum = parseFloat(hcpClean);
            if (!isNaN(hcpNum)) {
                handicap = hcapVal.startsWith('+') ? -hcpNum : hcpNum;
            }
        }

        players.push({
            name: normalizePlayerName(name),
            position,
            rounds,
            scores,
            gross: grossVal === 'NR' ? null : parseInt(grossVal, 10),
            handicap,
            handicapDisplay: hcapVal,
            net: netVal === 'NR' ? null : parseFloat(netVal),
            countback
        });
    }

    // Extract competitions list from footer
    const includedComps = [];
    let inCompList = false;
    for (let i = headerIndex; i < lines.length; i++) {
        const fields = parseCSVLine(lines[i]);
        if (fields[0] === 'Date' && fields[1] === 'Competition') {
            inCompList = true;
            continue;
        }
        if (inCompList && fields[0] && fields[1]) {
            includedComps.push({ date: fields[0], name: fields[1] });
        }
    }

    return { year, printDate, players, includedComps, error: null };
}

// ============ FILE PROCESSING ============

function extractDateKey(dateStr) {
    const all = extractAllDateKeys(dateStr);
    return all.length ? all[0] : null;
}

// Extract the LAST (most recent) actual calendar date contained in a date
// string, e.g. "Saturday 29 August 2026 and Sunday 30 August 2026" returns
// "2026-08-30", not the first day of the round. Used wherever "when was this
// competition actually played" chronology matters (handicap selection),
// as opposed to extractDateKey (first date), which is used for
// season-start filtering where the earliest day is the correct check.
// ISO "YYYY-MM-DD" keys compare correctly with a plain string comparison,
// so no date parsing is needed to find the maximum.
function extractLatestDateKey(dateStr) {
    const all = extractAllDateKeys(dateStr);
    if (!all.length) return null;
    let latest = all[0];
    for (const key of all) { if (key > latest) latest = key; }
    return latest;
}

// Extract every date in a date string (e.g. "Saturday 23 May 2026 & Sunday 24 May 2026"
// returns ["2026-05-23", "2026-05-24"]). Used for merge matching so a single-day
// scorecard can match a multi-day combined comp without falling back to substring
// checks that confuse "3 May 2026" with "23 May 2026".
function extractAllDateKeys(dateStr) {
    if (!dateStr) return [];
    const months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
                     january:1,february:2,march:3,april:4,june:6,july:7,august:8,september:9,october:10,november:11,december:12 };
    const out = [];
    const re = /(?:^|[^0-9])(\d{1,2})\s+(\w+)\s+(\d{4})/g;
    let m;
    while ((m = re.exec(dateStr)) !== null) {
        const mon = months[m[2].toLowerCase()];
        if (mon) out.push(m[3] + '-' + String(mon).padStart(2,'0') + '-' + m[1].padStart(2,'0'));
    }
    return out;
}

function findMatchingCompetition(info, scorecards, playerNames) {
    const dateKeys = extractAllDateKeys(info.date);
    for (const comp of appState.competitions) {
        if (comp.hidden) continue; // folded into another competition, not a standalone match target
        const compDateKeys = extractAllDateKeys(comp.info.date);
        // Match if any parsed date overlaps. Strict set-membership comparison
        // prevents bugs like "3 May 2026" matching "23 May 2026" via substring.
        if (dateKeys.length && compDateKeys.length) {
            if (dateKeys.some(d => compDateKeys.includes(d))) {
                // A bare date overlap is not enough on its own: two genuinely
                // different competitions can legitimately fall on the same
                // calendar date (e.g. a standalone Sunday Singles Stableford
                // round played the same day as the Captain's Prize Final).
                // Without this guard a new scorecard for one would silently
                // merge into the other's existing competition record purely
                // because the dates coincide, mixing two different fields of
                // players together and (if the existing competition is
                // flagged isEclectic:false, as Captain's Prize is) silently
                // dropping the new round out of Eclectic entirely.
                if (namesLikelySameTournament(info.name, comp.info.name) || sameFixtureIdentity(info, comp.info)) {
                    return comp;
                }
                continue;
            }
            continue; // both dates parsed but didn't overlap — not the same comp
        }
        // Last-resort substring fallback only when one side has no parseable date.
        if (info.date && comp.info.date) {
            if (comp.info.date.includes(info.date) || info.date.includes(comp.info.date)) return comp;
        }
    }
    if (scorecards || playerNames) {
        const names = playerNames || new Set(Object.keys(scorecards));
        for (const comp of appState.competitions) {
            if (comp.hidden) continue;
            // Skip comps where both have parseable dates that don't overlap
            // (prevents merging different weeks at the same club via player overlap)
            const compDateKeys2 = extractAllDateKeys(comp.info.date);
            if (dateKeys.length && compDateKeys2.length && !dateKeys.some(d => compDateKeys2.includes(d))) continue;
            // Only merge via player overlap if competition names are compatible
            // (prevents merging different weekly competitions at the same club)
            if (info.name && comp.info.name) {
                const a = info.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                const b = comp.info.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                // If both names exist and neither contains the other, skip this comp
                if (a.length > 10 && b.length > 10 && !a.includes(b.substring(0, 15)) && !b.includes(a.substring(0, 15))) continue;
            }
            const compNames = new Set([
                ...Object.keys(comp.scorecards || {}),
                ...(comp.results || []).map(r => r.playerName)
            ]);
            if (compNames.size === 0) continue;
            let overlap = 0;
            for (const n of names) { if (compNames.has(n)) overlap++; }
            const ratio = overlap / Math.min(names.size, compNames.size);
            if (ratio > 0.5) return comp;
        }
    }
    return null;
}

// Word-order-agnostic name compatibility check used by findAllMatchingCompetitionsByDate.
// Real Handicap Master exports name the same tournament differently across its
// scorecard files and aggregate report (e.g. "August Medal Alt Day",
// "August Men's Medal Strokes - Blue" and "Men's August Medal" are all the same
// two-day medal), so a strict prefix/substring check is too rigid. Instead, tokenize
// both names, drop generic export boilerplate words, and require at least two
// shared meaningful tokens (e.g. "august" and "medal") before treating two
// same-date competitions as the same event.
const COMPETITION_NAME_FILLER_WORDS = new Set([
    'the', 'a', 'an', 'to', 'of', 'and', 'at', 'in', 'on', 'for', 'by',
    'result', 'results', 'report', 'reports', 'aggregated', 'competition', 'competitions',
    'net', 'full', 'scorecard', 'scorecards', 'played', 'round', 'sunday', 'saturday'
]);

function tokenizeCompetitionName(name) {
    return (name.toLowerCase().match(/[a-z0-9']+/g) || [])
        .filter(t => t.length > 1 && !COMPETITION_NAME_FILLER_WORDS.has(t));
}

function namesLikelySameTournament(nameA, nameB) {
    if (!nameA || !nameB) return true; // not enough info to rule out a date-based match
    const tokensB = new Set(tokenizeCompetitionName(nameB));
    let shared = 0;
    for (const t of tokenizeCompetitionName(nameA)) { if (tokensB.has(t)) shared++; }
    return shared >= 2;
}

// Fallback identity check for when a report and its scorecard(s) share no
// name tokens at all (real Handicap Master exports sometimes carry a stale
// or mismatched "line 2" name on the aggregate report, e.g. a Singles
// Stableford report whose name field literally reads a leftover title from
// an unrelated event, while its scorecards are named generically). If both
// sides independently resolve, via the fixture list, to the exact same
// fixture entry (by date), AND that fixture is explicitly marked
// identityByDateOnly (see fixtures.js), they are the same competition
// regardless of what their raw name text says.
//
// The identityByDateOnly guard is essential, not optional: matchCompetitionToFixture
// has a known, accepted weakness (see test-august-medal-merge.js) where a
// genuinely unrelated same-day competition (e.g. a Ladies event sharing a
// Sunday with a Men's Medal) can also resolve to a fixture purely through its
// date-only fallback pass, with no keyword involved at all. Without this
// guard, that pre-existing weakness would leak into a false MERGE here
// (folding an unrelated competition's scores into the fixture's real one),
// not just a harmless mis-tagged fixture badge. Only fixtures we have
// explicitly reviewed and know have no reliable keyword in their real export
// data (the standalone Sunday Singles Stableford rounds and the 29/30 August
// aggregate) opt in via identityByDateOnly.
function sameFixtureIdentity(infoA, infoB) {
    if (typeof matchCompetitionToFixture !== 'function') return false;
    if (!infoA || !infoB) return false;
    const a = matchCompetitionToFixture(infoA.name, infoA.date);
    const b = matchCompetitionToFixture(infoB.name, infoB.date);
    if (!(a && b && a.fixture && b.fixture && a.fixture === b.fixture)) return false;
    return a.fixture.identityByDateOnly === true;
}

// Find every non-hidden competition whose date overlaps the given info's date(s),
// applying the word-order-agnostic name-compatibility guard above so unrelated
// competitions are not folded together just because a date matches. Used for
// multi-day aggregate reports (e.g. a report spanning Sat & Sun) that may need to
// reconcile against two separately loaded single-day scorecard competitions.
function findAllMatchingCompetitionsByDate(info) {
    const dateKeys = extractAllDateKeys(info.date);
    if (!dateKeys.length) return [];
    const matches = [];
    for (const comp of appState.competitions) {
        if (comp.hidden) continue;
        const compDateKeys = extractAllDateKeys(comp.info.date);
        if (!compDateKeys.length) continue;
        if (!dateKeys.some(d => compDateKeys.includes(d))) continue;
        if (!namesLikelySameTournament(info.name, comp.info.name) &&
            !sameFixtureIdentity(info, comp.info)) continue;
        matches.push(comp);
    }
    return matches;
}

// A hidden competition (folded into a primary row by foldCompetitionsIntoPrimary)
// still owns its own scorecards, so re-importing the exact daily scorecard file
// that originally created it must route back to that hidden competition rather
// than to the (now wider-dated) primary. Without this, findMatchingCompetition
// would skip the hidden owner, match the primary instead, and merge the same
// day's scorecards into the primary on top of the untouched copy still sitting
// in the hidden competition, double counting that player's Eclectic rounds.
// This is intentionally separate from findMatchingCompetition (which must keep
// skipping hidden competitions for report/general matching) and is only used
// for scorecard imports, where exact ownership of a specific day matters more
// than the widened date range a primary picks up after folding.
function findHiddenOwnerForScorecard(info) {
    const dateKeys = extractAllDateKeys(info.date);
    if (!dateKeys.length) return null;
    for (const comp of appState.competitions) {
        if (!comp.hidden) continue;
        const compDateKeys = extractAllDateKeys(comp.info.date);
        if (!compDateKeys.length) continue;
        if (!dateKeys.some(d => compDateKeys.includes(d))) continue;
        if (!namesLikelySameTournament(info.name, comp.info.name) &&
            !sameFixtureIdentity(info, comp.info)) continue;
        return comp;
    }
    return null;
}

// Fold one or more duplicate competitions into a single primary competition so
// they render as one row in Loaded Competitions, while leaving each duplicate's
// own scorecards/results untouched so downstream calculations (GOY, Eclectic)
// keep iterating over every original competition entry exactly as before.
function foldCompetitionsIntoPrimary(primary, duplicates) {
    primary.mergedCompetitionIds = primary.mergedCompetitionIds || [];
    for (const dup of duplicates) {
        if (dup === primary) continue;
        dup.hidden = true;
        dup.mergedIntoId = primary.id;
        if (!primary.mergedCompetitionIds.includes(dup.id)) primary.mergedCompetitionIds.push(dup.id);
    }
    return primary;
}

function processUploadedFile(text, filename) {
    const type = detectCSVType(text);

    if (type === 'eclectic') {
        const parsed = parseEclecticCSV(text);
        if (parsed.error) return { error: parsed.error };
        appState.eclecticData = parsed;
        return { type: 'eclectic', playerCount: parsed.players.length, year: parsed.year };
    }

    if (type === 'scorecards') {
        const parsed = parseScorecardCSV(text);
        const playerCount = Object.keys(parsed.scorecards).length;
        // Re-importing the exact daily scorecard file that a primary row folded
        // (see findHiddenOwnerForScorecard) must go back to that hidden owner,
        // not to the primary, otherwise the same day's scores would be merged
        // into the primary on top of the copy still held by the hidden owner,
        // double counting that day for every player who played it.
        const existing = findHiddenOwnerForScorecard(parsed.info) || findMatchingCompetition(parsed.info, parsed.scorecards);
        if (existing) {
            existing.scorecards = { ...existing.scorecards, ...parsed.scorecards };
            existing.hasScorecard = true;
            if (!existing.info.date && parsed.info.date) existing.info.date = parsed.info.date;
            return { merged: true, competition: existing, playerCount };
        }
        const comp = {
            id: generateId(), filename, info: parsed.info, type: 'scorecards',
            hasReport: false, hasScorecard: true, results: [],
            scorecards: parsed.scorecards, handicaps: parsed.handicaps || {},
            config: { isGOY: false, isCaptains: false }
        };
        appState.competitions.push(comp);
        return { merged: false, competition: comp, playerCount };

    } else if (type === 'report') {
        const parsed = parseCompetitionReportCSV(text);
        const existingNames = new Set(parsed.results.map(r => r.playerName));
        // A multi-day aggregate report (e.g. "played on Saturday & Sunday") can
        // legitimately overlap two separately loaded single-day scorecard
        // competitions (alt-day round + main round of the same medal). Fold
        // any extra matches into the first one so the report attaches exactly
        // once and Loaded Competitions shows a single combined row.
        // findAllMatchingCompetitionsByDate applies a name-compatibility guard,
        // so it is safe from the "same date, different event" false merge that
        // findMatchingCompetition's plain date loop is prone to; only fall back
        // to findMatchingCompetition (player-overlap based) when the report has
        // no parseable date at all to match against.
        const reportDateKeys = extractAllDateKeys(parsed.info.date);
        let existing = null;
        if (reportDateKeys.length) {
            const dateMatches = findAllMatchingCompetitionsByDate(parsed.info);
            if (dateMatches.length) {
                existing = dateMatches[0];
                if (dateMatches.length > 1) foldCompetitionsIntoPrimary(dateMatches[0], dateMatches.slice(1));
            }
        } else {
            existing = findMatchingCompetition(parsed.info, null, existingNames);
        }
        if (existing) {
            existing.results = parsed.results;
            existing.handicaps = { ...existing.handicaps, ...parsed.handicaps };
            existing.hasReport = true;
            if (parsed.info.name && parsed.info.name !== 'Competition Scorecards') existing.info.name = parsed.info.name;
            if (parsed.info.date) existing.info.date = parsed.info.date;
            // Always re-apply fixture matching on merge to ensure correct flags
            if (typeof matchCompetitionToFixture === 'function') {
                const fixtureMatch = matchCompetitionToFixture(existing.info.name, existing.info.date);
                if (fixtureMatch) {
                    existing.config.isGOY = fixtureMatch.isGOY;
                    existing.config.isEclectic = (fixtureMatch.isEclectic !== undefined) ? !!fixtureMatch.isEclectic : true;
                    existing.config.isCaptains = fixtureMatch.isCaptains;
                    existing.fixtureMatch = fixtureMatch.fixture ? fixtureMatch.fixture.name : 'name-marker';
                } else {
                    existing.config.isGOY = false;
                    // Leave isEclectic undefined for unmatched comps — calc treats undefined as "include"
                    // to preserve existing Eclectic-table behaviour for events outside the fixture list.
                    existing.config.isCaptains = false;
                    existing.fixtureMatch = null;
                }
            }
            return { merged: true, competition: existing, playerCount: parsed.results.length };
        }
        const comp = {
            id: generateId(), filename, info: parsed.info, type: 'report',
            hasReport: true, hasScorecard: false, results: parsed.results,
            scorecards: {}, handicaps: parsed.handicaps,
            config: { isGOY: false, isCaptains: false }
        };
        // Auto-detect GOY / Eclectic / Captain's flags from fixture list
        const fixtureMatch = (typeof matchCompetitionToFixture === 'function')
            ? matchCompetitionToFixture(parsed.info.name, parsed.info.date)
            : null;
        if (fixtureMatch) {
            comp.config.isGOY = fixtureMatch.isGOY;
            comp.config.isEclectic = (fixtureMatch.isEclectic !== undefined) ? !!fixtureMatch.isEclectic : true;
            comp.config.isCaptains = fixtureMatch.isCaptains;
            comp.fixtureMatch = fixtureMatch.fixture ? fixtureMatch.fixture.name : 'name-marker';
        } else {
            // Fallback: if no fixture match, don't assume GOY.
            // isEclectic stays undefined so the calc treats it as "include" (back-compat).
            comp.config.isGOY = false;
        }
        appState.competitions.push(comp);
        return { merged: false, competition: comp, playerCount: parsed.results.length };

    } else {
        return { error: "Could not detect CSV type. Ensure it's a Handicap Master export." };
    }
}

function generateId() {
    return 'comp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

// ============ GOY ENGINE ============

function calculateGOY() {
    const goyComps = appState.competitions.filter(c => c.config.isGOY && c.hasReport);
    if (goyComps.length === 0) return null;

    const playerPoints = {};
    for (const comp of goyComps) {
        const pointsTable = comp.config.isCaptains ? GOY_POINTS_CAPTAINS : GOY_POINTS_NORMAL;
        for (const result of comp.results) {
            if (result.position < 1 || result.position > 20) continue;
            const pts = pointsTable[result.position - 1];
            const name = result.playerName;
            if (!playerPoints[name]) playerPoints[name] = { total: 0, comps: {}, compCount: 0 };
            playerPoints[name].comps[comp.id] = pts;
            playerPoints[name].total += pts;
            playerPoints[name].compCount++;
        }
    }

    const leaderboard = Object.entries(playerPoints)
        .map(([name, data]) => ({ playerName: name, total: data.total, comps: data.comps, compCount: data.compCount }))
        .sort((a, b) => b.total - a.total || a.playerName.localeCompare(b.playerName));

    let pos = 1;
    for (let i = 0; i < leaderboard.length; i++) {
        if (i > 0 && leaderboard[i].total === leaderboard[i-1].total) {
            leaderboard[i].position = leaderboard[i-1].position;
        } else {
            leaderboard[i].position = pos;
        }
        pos++;
    }
    return { leaderboard, competitions: goyComps };
}

// ============ ECLECTIC ENGINE ============

function calculateEclecticFromScorecards() {
    // Eclectic eligibility: must have a scorecard AND not be explicitly flagged
    // as non-Eclectic (isEclectic === false). Undefined is treated as "include"
    // to preserve back-compat with any uploaded event that's outside the fixture list.
    // The eclecticStartDate (fixtures.js) acts as a backstop: anything dated before
    // it is excluded regardless of the flag (guards against pre-season rounds).
    const startKey = (typeof GOY_FIXTURES !== 'undefined' && GOY_FIXTURES.eclecticStartDate) || null;
    const compsWithCards = appState.competitions.filter(c => {
        if (!c.hasScorecard) return false;
        if (c.config.isEclectic === false) return false;
        if (startKey) {
            const dk = extractDateKey(c.info.date);
            if (dk && dk < startKey) return false;
        }
        return true;
    });
    if (compsWithCards.length === 0) return null;

    // Collect latest handicap per player (from most recent competition, by
    // actual competition date). Sort ascending by each competition's LATEST
    // played date (extractLatestDateKey, not extractDateKey/first-date) so a
    // multi-day competition is ordered by when it actually finished, not by
    // whichever day happens to be printed first in its date string. This is
    // what lets the Sunday 30 August aggregated report (a two-day 29/30
    // August competition) correctly supply the terminal playing handicap
    // even though 29 August is the first date in its date string.
    //
    // Same-date ties are resolved deterministically (by competition name,
    // then filename) rather than by array/import order, so re-uploading
    // files in a different order, or a differently-ordered PRELOADED_CSV_FILES
    // array, can never silently change whose handicap wins a tie.
    const sortedComps = [...appState.competitions].sort((a, b) => {
        const da = extractLatestDateKey(a.info.date) || '';
        const db = extractLatestDateKey(b.info.date) || '';
        if (da !== db) return da.localeCompare(db);
        const nameA = a.info.name || '';
        const nameB = b.info.name || '';
        if (nameA !== nameB) return nameA.localeCompare(nameB);
        return (a.filename || '').localeCompare(b.filename || '');
    });
    const latestHandicap = {};
    for (const comp of sortedComps) {
        if (comp.handicaps) {
            for (const [name, hcap] of Object.entries(comp.handicaps)) {
                latestHandicap[name] = hcap; // later comps overwrite earlier
            }
        }
    }

    // For each player, find best (lowest) score on each hole across all competitions
    const playerBest = {};
    for (const comp of compsWithCards) {
        for (const [name, scores] of Object.entries(comp.scorecards)) {
            if (!playerBest[name]) {
                playerBest[name] = { scores: new Array(18).fill(null), rounds: 0 };
            }
            const hasValidScore = scores.some(s => s !== null);
            if (hasValidScore) playerBest[name].rounds++;
            for (let h = 0; h < 18; h++) {
                const s = scores[h];
                if (s !== null) {
                    if (playerBest[name].scores[h] === null || s < playerBest[name].scores[h]) {
                        playerBest[name].scores[h] = s;
                    }
                }
            }
        }
    }

    // Build player list — only include players who:
    // 1. Appear in a competition report (have a handicap)
    // 2. Have a valid score on all 18 holes
    const players = [];
    for (const [name, data] of Object.entries(playerBest)) {
        const handicap = latestHandicap[name];
        if (handicap === undefined || handicap === null) continue; // not in any report

        const scores = data.scores;
        const allFilled = scores.every(s => s !== null);
        if (!allFilled) continue; // incomplete — needs a score on every hole

        const gross = scores.reduce((a, b) => a + b, 0);
        const net = gross - handicap;

        // Countback (CSS) values — used as tiebreakers within tied positions.
        // Best = fewest strokes on each segment. Computed for both gross and net.
        const back9Gross = scores.slice(9, 18).reduce((a, b) => a + b, 0);
        const back6Gross = scores.slice(12, 18).reduce((a, b) => a + b, 0);
        const back3Gross = scores.slice(15, 18).reduce((a, b) => a + b, 0);
        const lastHoleGross = scores[17];

        const netScores = [];
        for (let h = 0; h < 18; h++) {
            netScores.push(scores[h] - getStrokesOnHole(handicap, h));
        }
        const back9Net = netScores.slice(9, 18).reduce((a, b) => a + b, 0);
        const back6Net = netScores.slice(12, 18).reduce((a, b) => a + b, 0);
        const back3Net = netScores.slice(15, 18).reduce((a, b) => a + b, 0);
        const lastHoleNet = netScores[17];

        players.push({
            name,
            position: 0,
            rounds: data.rounds,
            scores,
            gross,
            handicap,
            // Plus handicaps are stored internally as negative numbers (golf
            // convention, see medalPlusMatch above), but should still read as
            // "+4" rather than "-4" wherever the handicap is displayed.
            handicapDisplay: handicap < 0 ? ('+' + Math.abs(handicap)) : String(handicap),
            net,
            countback: '',
            back9Gross, back6Gross, back3Gross, lastHoleGross,
            back9Net, back6Net, back3Net, lastHoleNet
        });
    }

    // Build included competitions list
    const includedComps = compsWithCards.map(c => ({
        date: c.info.date || '',
        name: c.info.name || c.filename
    }));

    return {
        year: new Date().getFullYear().toString(),
        printDate: '',
        players,
        includedComps,
        error: null
    };
}

// ============ HANDICAP STROKES ============

function getStrokesOnHole(handicap, holeIndex) {
    const holeSI = COURSE.si[holeIndex];
    const ph = Math.round(handicap);
    if (ph <= 0) return 0;
    if (ph <= 18) return holeSI <= ph ? 1 : 0;
    if (ph <= 36) return holeSI <= (ph - 18) ? 2 : 1;
    return holeSI <= (ph - 36) ? 3 : 2;
}

// ============ SCORE CELL STYLING ============

function getScoreCellStyle(diff) {
    if (diff <= -2) return 'background:#FFD700;font-weight:700';
    if (diff === -1) return 'background:#FF0000;color:#fff;font-weight:700';
    if (diff === 0) return 'background:#92D050';
    if (diff === 1) return 'background:#BDD7EE';
    if (diff === 2) return 'background:#A6A6A6;color:#fff';
    if (diff >= 3) return 'background:#808080;color:#fff';
    return '';
}

// ============ TABLE RENDERING ============

function renderGOYTable(results) {
    if (!results) return '<p class="status-msg info">No GOY data. Upload Competition Report CSVs and mark them as GOY.</p>';
    const { leaderboard, competitions } = results;
    const compIds = competitions.map(c => c.id);

    // Get all fixture competitions for full-width table
    // Only render GOY-flagged fixtures as columns. Non-GOY fixtures (e.g.,
    // Singles Stableford, Scratch Cups) still upload and count for Eclectic
    // but don't appear in the GOY leaderboard table.
    const allFixtures = (typeof GOY_FIXTURES !== 'undefined') ? GOY_FIXTURES.competitions.filter(f => f.isGOY) : [];
    const year = (typeof GOY_FIXTURES !== 'undefined') ? GOY_FIXTURES.year : new Date().getFullYear();

    // Map fixture to loaded competition (if uploaded)
    const fixtureColumns = allFixtures.map((fixture, idx) => {
        const matchedComp = competitions.find(c => {
            const name = (c.info.name || '').toLowerCase();
            return fixture.keywords.some(kw => name.includes(kw));
        });
        const dateStr = fixture.dates[fixture.dates.length - 1]; // Use last date (Sunday)
        const dt = new Date(dateStr);
        const day = dt.getDate();
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const dateLabel = day + '-' + monthNames[dt.getMonth()];
        // Short name for column
        let shortName = fixture.name
            .replace(/Men's\s*/gi, '')
            .replace(/\s*\(GOY\)/gi, '')
            .replace(/\s*to Men/gi, '')
            .replace(/\s*& PGA Tankard/gi, '')
            .replace(/Captain.*Prize/i, 'Captains Prize')
            .replace(/Lady Captain.*Prize/i, 'Lady Capt Prize')
            .replace(/Lady President.*Prize/i, 'Lady Pres Prize')
            .replace(/Professional.*Prize/i, 'Pro/PGA')
            .replace(/President.*Prize/i, 'Presidents Prize')
            .replace(/C\.G\.\s*/i, '')
            .trim();
        return {
            eventNum: idx + 1,
            date: dateLabel,
            name: shortName,
            compId: matchedComp ? matchedComp.id : null,
            isCaptains: fixture.isCaptains
        };
    });

    // Find current leader
    const leader = leaderboard.length > 0 ? leaderboard[0].playerName : '';

    let html = '<div class="goy-title-bar">Golfer of the Year ' + year;
    if (leader) html += ' - Current Leader: ' + escapeHtml(leader);
    html += '</div>';

    html += '<table id="goy-table"><thead>';

    // Row 1: Event numbers
    html += '<tr class="goy-header-row"><th></th><th></th><th></th><th></th>';
    for (const col of fixtureColumns) {
        html += '<th class="comp-col">' + col.eventNum + '</th>';
    }
    html += '</tr>';

    // Row 2: Dates
    html += '<tr class="goy-header-row"><th></th><th></th><th></th><th></th>';
    for (const col of fixtureColumns) {
        html += '<th class="comp-col goy-date-header">' + col.date + '</th>';
    }
    html += '</tr>';

    // Row 3: Competition names + column labels
    html += '<tr class="goy-header-row"><th>Rank</th><th>Points</th><th>Events</th><th>Player</th>';
    for (const col of fixtureColumns) {
        html += '<th class="comp-col"><div class="comp-col-header" title="' + escapeHtml(col.name) + '">' + escapeHtml(col.name) + '</div></th>';
    }
    html += '</tr>';

    html += '</thead><tbody>';

    for (const player of leaderboard) {
        const rankClass = player.position <= 3 ? ' class="rank-' + player.position + '"' : '';
        html += '<tr' + rankClass + '>';
        html += '<td>' + player.position + '</td>';
        html += '<td class="total-cell">' + player.total + '</td>';
        html += '<td>' + player.compCount + '</td>';
        html += '<td class="player-name">' + escapeHtml(displayName(player.playerName)) + '</td>';
        for (const col of fixtureColumns) {
            const pts = col.compId ? (player.comps[col.compId] || 0) : 0;
            html += '<td class="comp-col">' + pts + '</td>';
        }
        html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
}

function renderEclecticGrossTable(data) {
    if (!data || !data.players || data.players.length === 0) {
        return '<p class="status-msg info">No Eclectic data. Upload an Eclectic CSV from Handicap Master.</p>';
    }

    // Sort by gross ascending; within ties use CSS countback
    // (best back 9, then back 6, then back 3, then last hole — all "fewest strokes wins").
    const players = [...data.players].sort((a, b) => {
        if (a.gross === null && b.gross === null) return 0;
        if (a.gross === null) return 1;
        if (b.gross === null) return -1;
        if (a.gross !== b.gross) return a.gross - b.gross;
        if (a.back9Gross !== b.back9Gross) return a.back9Gross - b.back9Gross;
        if (a.back6Gross !== b.back6Gross) return a.back6Gross - b.back6Gross;
        if (a.back3Gross !== b.back3Gross) return a.back3Gross - b.back3Gross;
        return a.lastHoleGross - b.lastHoleGross;
    });

    // Find the winner
    const winner = players.length > 0 && players[0].gross !== null ? players[0].name : '';
    const year = data.year || new Date().getFullYear();

    let html = '<div class="eclectic-title-bar">Captain\'s Eclectic Cup (Gross) ' + year + ' — Current Standings</div>';

    html += '<table class="eclectic-table"><thead>';

    // Hole numbers row
    html += '<tr><th>Overall</th><th>Name</th><th class="rnds-col">Rounds</th>';
    for (let h = 1; h <= 18; h++) {
        html += '<th>' + h + '</th>';
        if (h === 9) html += '<th class="total-col">Out</th>';
    }
    html += '<th class="total-col">In</th>';
    html += '<th class="total-col">Gross</th></tr>';

    // Par row
    html += '<tr class="par-row"><th></th><th style="text-align:left">Par</th><th></th>';
    for (let h = 0; h < 18; h++) {
        html += '<th>' + COURSE.par[h] + '</th>';
        if (h === 8) html += '<th>' + COURSE.outPar + '</th>';
    }
    html += '<th>' + COURSE.inPar + '</th>';
    html += '<th>72</th></tr>';
    html += '</thead><tbody>';

    // Re-assign positions based on gross sort
    let pos = 1;
    for (let i = 0; i < players.length; i++) {
        const p = players[i];
        if (p.gross === null) { p.grossPos = '-'; }
        else if (i > 0 && p.gross === players[i-1].gross) { p.grossPos = players[i-1].grossPos; }
        else { p.grossPos = pos; }
        pos++;
    }

    // Annotate countback level for tied players. Compare each player to its
    // neighbour in the same tied group (preferring the player above, falling
    // back to the player below for the top of a cluster). The deepest metric
    // that differs is the annotation. Truly identical players get no note.
    for (let i = 0; i < players.length; i++) {
        const p = players[i];
        p.grossTieNote = '';
        if (p.gross === null) continue;
        let nb = null;
        if (i > 0 && players[i-1].gross === p.gross) nb = players[i-1];
        else if (i + 1 < players.length && players[i+1].gross === p.gross) nb = players[i+1];
        if (!nb) continue;
        if (p.back9Gross !== nb.back9Gross)      p.grossTieNote = 'last 9';
        else if (p.back6Gross !== nb.back6Gross) p.grossTieNote = 'last 6';
        else if (p.back3Gross !== nb.back3Gross) p.grossTieNote = 'last 3';
        else if (p.lastHoleGross !== nb.lastHoleGross) p.grossTieNote = 'last hole';
    }

    for (const p of players) {
        const rankClass = p.grossPos <= 3 ? ' class="rank-' + p.grossPos + '"' : '';
        html += '<tr' + rankClass + '>';
        html += '<td>' + p.grossPos + '</td>';
        const note = p.grossTieNote ? ' <span class="tie-note">(' + p.grossTieNote + ')</span>' : '';
        html += '<td class="player-name">' + escapeHtml(displayName(p.name)) + note + '</td>';
        html += '<td class="rnds-col">' + p.rounds + '</td>';

        let outSum = 0, inSum = 0;
        for (let h = 0; h < 18; h++) {
            const s = p.scores[h];
            if (s === null) {
                html += '<td>-</td>';
            } else {
                if (h < 9) outSum += s; else inSum += s;
                const diff = s - COURSE.par[h];
                const style = getScoreCellStyle(diff);
                html += '<td' + (style ? ' style="' + style + '"' : '') + '>' + s + '</td>';
            }
            if (h === 8) {
                html += '<td class="total-cell">' + outSum + '</td>';
            }
        }
        html += '<td class="total-cell">' + inSum + '</td>';

        if (p.gross !== null) {
            html += '<td class="total-cell">' + p.gross + '</td>';
        } else {
            html += '<td class="total-cell">NR</td>';
        }
        html += '</tr>';
    }

    html += '</tbody></table>';
    return html;
}

function renderEclecticNettTable(data) {
    if (!data || !data.players || data.players.length === 0) {
        return '<p class="status-msg info">No Eclectic data. Upload an Eclectic CSV from Handicap Master.</p>';
    }

    // Sort by net ascending; within ties use CSS countback on NET scores
    // (best back 9, then back 6, then back 3, then last hole — all "fewest strokes wins").
    const players = [...data.players].sort((a, b) => {
        if (a.net === null && b.net === null) return 0;
        if (a.net === null) return 1;
        if (b.net === null) return -1;
        if (a.net !== b.net) return a.net - b.net;
        if (a.back9Net !== b.back9Net) return a.back9Net - b.back9Net;
        if (a.back6Net !== b.back6Net) return a.back6Net - b.back6Net;
        if (a.back3Net !== b.back3Net) return a.back3Net - b.back3Net;
        return a.lastHoleNet - b.lastHoleNet;
    });

    const winner = players.length > 0 && players[0].net !== null ? players[0].name : '';
    const year = data.year || new Date().getFullYear();

    let html = '<div class="eclectic-title-bar">Captain\'s Eclectic Cup (Nett) ' + year + ' — Current Standings</div>';

    html += '<table class="eclectic-table"><thead>';

    // Hole numbers + column headers
    html += '<tr><th>Overall</th><th>Name</th><th class="rnds-col">Rounds</th>';
    for (let h = 1; h <= 18; h++) {
        html += '<th>' + h + '</th>';
        if (h === 9) html += '<th class="total-col">Out</th>';
    }
    html += '<th class="total-col">In</th>';
    html += '<th class="total-col">Gross</th><th>H\'cap</th><th class="total-col">Net</th></tr>';

    // Par row
    html += '<tr class="par-row"><th></th><th style="text-align:left">Par</th><th></th>';
    for (let h = 0; h < 18; h++) {
        html += '<th>' + COURSE.par[h] + '</th>';
        if (h === 8) html += '<th>' + COURSE.outPar + '</th>';
    }
    html += '<th>' + COURSE.inPar + '</th>';
    html += '<th>72</th><th></th><th></th></tr>';
    html += '</thead><tbody>';

    // Assign positions based on net sort
    let pos = 1;
    for (let i = 0; i < players.length; i++) {
        const p = players[i];
        if (p.net === null) { p.nettPos = '-'; }
        else if (i > 0 && p.net === players[i-1].net) { p.nettPos = players[i-1].nettPos; }
        else { p.nettPos = pos; }
        pos++;
    }

    // Annotate countback level for tied players (using NET back-9/6/3/hole).
    // Compare each player to its neighbour in the same tied group (preferring
    // the player above, falling back to the player below for the top of a
    // cluster). The deepest metric that differs is the annotation. Truly
    // identical players get no note.
    for (let i = 0; i < players.length; i++) {
        const p = players[i];
        p.nettTieNote = '';
        if (p.net === null) continue;
        let nb = null;
        if (i > 0 && players[i-1].net === p.net) nb = players[i-1];
        else if (i + 1 < players.length && players[i+1].net === p.net) nb = players[i+1];
        if (!nb) continue;
        if (p.back9Net !== nb.back9Net)      p.nettTieNote = 'last 9';
        else if (p.back6Net !== nb.back6Net) p.nettTieNote = 'last 6';
        else if (p.back3Net !== nb.back3Net) p.nettTieNote = 'last 3';
        else if (p.lastHoleNet !== nb.lastHoleNet) p.nettTieNote = 'last hole';
    }

    for (const p of players) {
        const rankClass = p.nettPos <= 3 ? ' class="rank-' + p.nettPos + '"' : '';
        html += '<tr' + rankClass + '>';
        html += '<td>' + p.nettPos + '</td>';
        const note = p.nettTieNote ? ' <span class="tie-note">(' + p.nettTieNote + ')</span>' : '';
        html += '<td class="player-name">' + escapeHtml(displayName(p.name)) + note + '</td>';
        html += '<td class="rnds-col">' + p.rounds + '</td>';

        let outSum = 0, inSum = 0;
        for (let h = 0; h < 18; h++) {
            const s = p.scores[h];
            if (s === null) {
                html += '<td>-</td>';
            } else {
                if (h < 9) outSum += s; else inSum += s;
                // Color based on gross score vs par (same as gross table)
                const diff = s - COURSE.par[h];
                const style = getScoreCellStyle(diff);
                html += '<td' + (style ? ' style="' + style + '"' : '') + '>' + s + '</td>';
            }
            if (h === 8) {
                html += '<td class="total-cell">' + outSum + '</td>';
            }
        }
        html += '<td class="total-cell">' + inSum + '</td>';

        html += '<td class="total-cell">' + (p.gross !== null ? p.gross : 'NR') + '</td>';
        html += '<td>' + (p.handicapDisplay || '-') + '</td>';
        html += '<td class="total-cell">' + (p.net !== null ? p.net : 'NR') + '</td>';
        html += '</tr>';
    }

    html += '</tbody></table>';
    return html;
}

// ============ ECLECTIC INSIGHTS ============

function renderEclecticInsights(data) {
    if (!data || !data.players || data.players.length === 0) {
        return '<p class="status-msg info">No eclectic data available for insights.</p>';
    }

    const players = data.players;
    const completePlayers = players.filter(p => p.gross !== null).sort((a, b) => {
        if (a.gross !== b.gross) return a.gross - b.gross;
        if (a.back9Gross !== b.back9Gross) return a.back9Gross - b.back9Gross;
        if (a.back6Gross !== b.back6Gross) return a.back6Gross - b.back6Gross;
        if (a.back3Gross !== b.back3Gross) return a.back3Gross - b.back3Gross;
        return a.lastHoleGross - b.lastHoleGross;
    });
    // Leader's countback note (compared to whoever is closest behind on equal gross)
    let grossLeaderTieNote = '';
    if (completePlayers.length > 1 && completePlayers[0].gross === completePlayers[1].gross) {
        const a = completePlayers[0], b = completePlayers[1];
        if (a.back9Gross !== b.back9Gross)      grossLeaderTieNote = 'last 9';
        else if (a.back6Gross !== b.back6Gross) grossLeaderTieNote = 'last 6';
        else if (a.back3Gross !== b.back3Gross) grossLeaderTieNote = 'last 3';
        else if (a.lastHoleGross !== b.lastHoleGross) grossLeaderTieNote = 'last hole';
    }
    const totalPlayers = players.length;
    const year = data.year || new Date().getFullYear();

    // ---- HOLE-BY-HOLE ANALYSIS ----
    const holeStats = [];
    for (let h = 0; h < 18; h++) {
        const par = COURSE.par[h];
        const si = COURSE.si[h];
        let eagles = 0, birdies = 0, pars = 0, bogeys = 0, doubles = 0, worse = 0;
        let total = 0, count = 0;
        let bestScore = null, bestPlayers = [];

        for (const p of players) {
            const s = p.scores[h];
            if (s === null) continue;
            count++;
            total += s;
            const diff = s - par;
            if (diff <= -2) eagles++;
            else if (diff === -1) birdies++;
            else if (diff === 0) pars++;
            else if (diff === 1) bogeys++;
            else if (diff === 2) doubles++;
            else worse++;

            if (bestScore === null || s < bestScore) {
                bestScore = s;
                bestPlayers = [p.name];
            } else if (s === bestScore) {
                bestPlayers.push(p.name);
            }
        }

        const avg = count > 0 ? total / count : 0;
        const avgVsPar = avg - par;
        holeStats.push({
            hole: h + 1, par, si, avg, avgVsPar, count,
            eagles, birdies, pars, bogeys, doubles, worse,
            bestScore, bestPlayers,
            parRate: count > 0 ? ((pars + birdies + eagles) / count * 100) : 0
        });
    }

    // Sort for easiest/hardest
    const byDifficulty = [...holeStats].sort((a, b) => b.avgVsPar - a.avgVsPar);
    const hardest = byDifficulty.slice(0, 3);
    const easiest = byDifficulty.slice(-3).reverse();

    // ---- PLAYER AWARDS ----
    const playerAwards = [];
    for (const p of players) {
        let eagles = 0, birdies = 0, pars = 0, underPar = 0;
        let filledHoles = 0;
        for (let h = 0; h < 18; h++) {
            const s = p.scores[h];
            if (s === null) continue;
            filledHoles++;
            const diff = s - COURSE.par[h];
            if (diff <= -2) { eagles++; underPar += Math.abs(diff); }
            else if (diff === -1) { birdies++; underPar++; }
            else if (diff === 0) pars++;
        }
        playerAwards.push({
            name: p.name, eagles, birdies, pars, underPar,
            gross: p.gross, rounds: p.rounds, filledHoles
        });
    }

    // Totals
    const totalEagles = playerAwards.reduce((a, p) => a + p.eagles, 0);
    const totalBirdies = playerAwards.reduce((a, p) => a + p.birdies, 0);
    const totalPars = playerAwards.reduce((a, p) => a + p.pars, 0);

    // Top lists
    const mostBirdies = [...playerAwards].sort((a, b) => b.birdies - a.birdies).slice(0, 5);
    const mostPars = [...playerAwards].sort((a, b) => b.pars - a.pars).slice(0, 5);
    const eaglePlayers = playerAwards.filter(p => p.eagles > 0).sort((a, b) => b.eagles - a.eagles);

    // "One to go" — players missing exactly 1 hole
    const oneToGo = playerAwards.filter(p => p.filledHoles === 17)
        .map(p => {
            const missingHole = players.find(pl => pl.name === p.name).scores.findIndex(s => s === null) + 1;
            return { name: p.name, missingHole };
        });

    // Best front 9 / back 9
    let bestFront9 = null, bestBack9 = null;
    for (const p of completePlayers) {
        const f9 = p.scores.slice(0, 9).reduce((a, b) => a + b, 0);
        const b9 = p.scores.slice(9).reduce((a, b) => a + b, 0);
        if (!bestFront9 || f9 < bestFront9.score) bestFront9 = { name: p.name, score: f9 };
        if (!bestBack9 || b9 < bestBack9.score) bestBack9 = { name: p.name, score: b9 };
    }

    const coursePar = COURSE.par.reduce((a, b) => a + b, 0);
    const frontPar = COURSE.par.slice(0, 9).reduce((a, b) => a + b, 0);
    const backPar = COURSE.par.slice(9).reduce((a, b) => a + b, 0);

    // ---- BUILD HTML ----
    let html = '<div class="insights-grid">';

    // Overview stats
    html += '<div class="insight-card insight-wide">';
    html += '<h4>📊 Season Overview</h4>';
    html += '<div class="insight-stats">';
    html += '<div class="stat-item"><span class="stat-num">' + totalPlayers + '</span><span class="stat-label">Players</span></div>';
    html += '<div class="stat-item"><span class="stat-num">' + completePlayers.length + '</span><span class="stat-label">Full Cards</span></div>';
    html += '<div class="stat-item"><span class="stat-num">' + totalEagles + '</span><span class="stat-label">🟡 Total Eagles</span></div>';
    html += '<div class="stat-item"><span class="stat-num">' + totalBirdies + '</span><span class="stat-label">🔴 Birdies</span></div>';
    html += '<div class="stat-item"><span class="stat-num">' + totalPars + '</span><span class="stat-label">🟢 Pars</span></div>';
    if (completePlayers.length > 0) {
        html += '<div class="stat-item"><span class="stat-num">' + completePlayers[0].gross + '</span><span class="stat-label">Best Gross</span></div>';
    }
    html += '</div></div>';

    // Gross Field Snapshot (mirrors Nett Field Snapshot)
    if (completePlayers.length > 0) {
        html += '<div class="insight-card insight-wide">';
        html += '<h4>🎯 Gross Field Snapshot</h4>';
        html += '<div class="insight-stats">';
        html += '<div class="stat-item"><span class="stat-num">' + completePlayers.length + '</span><span class="stat-label">Full Cards</span></div>';
        html += '<div class="stat-item"><span class="stat-num">' + completePlayers[0].gross + '</span><span class="stat-label">Best Gross</span></div>';
        html += '<div class="stat-item"><span class="stat-num">' + escapeHtml(displayName(completePlayers[0].name)) + (grossLeaderTieNote ? ' <span class="tie-note">(' + grossLeaderTieNote + ')</span>' : '') + '</span><span class="stat-label">Gross Leader</span></div>';
        const avgGross = (completePlayers.reduce((a, p) => a + p.gross, 0) / completePlayers.length).toFixed(1);
        html += '<div class="stat-item"><span class="stat-num">' + avgGross + '</span><span class="stat-label">Avg Gross</span></div>';
        const avgGrossHcap = (completePlayers.reduce((a, p) => a + (p.handicap || 0), 0) / completePlayers.length).toFixed(1);
        html += '<div class="stat-item"><span class="stat-num">' + avgGrossHcap + '</span><span class="stat-label">Avg Handicap</span></div>';
        html += '</div></div>';
    }

    // Hardest holes
    html += '<div class="insight-card">';
    html += '<h4>💀 Hardest Holes</h4>';
    html += '<table class="insight-table"><thead><tr><th>Hole</th><th>Par</th><th>SI</th><th>Avg</th><th>vs Par</th></tr></thead><tbody>';
    for (const h of hardest) {
        html += '<tr><td><strong>' + h.hole + '</strong></td><td>' + h.par + '</td><td>' + h.si + '</td>';
        html += '<td>' + h.avg.toFixed(2) + '</td>';
        html += '<td style="color:#c00;font-weight:700">+' + h.avgVsPar.toFixed(2) + '</td></tr>';
    }
    html += '</tbody></table></div>';

    // Easiest holes
    html += '<div class="insight-card">';
    html += '<h4>🎯 Easiest Holes</h4>';
    html += '<table class="insight-table"><thead><tr><th>Hole</th><th>Par</th><th>SI</th><th>Avg</th><th>vs Par</th></tr></thead><tbody>';
    for (const h of easiest) {
        const sign = h.avgVsPar < 0 ? '' : '+';
        const color = h.avgVsPar < 0 ? '#1a5e1a' : '#666';
        html += '<tr><td><strong>' + h.hole + '</strong></td><td>' + h.par + '</td><td>' + h.si + '</td>';
        html += '<td>' + h.avg.toFixed(2) + '</td>';
        html += '<td style="color:' + color + ';font-weight:700">' + sign + h.avgVsPar.toFixed(2) + '</td></tr>';
    }
    html += '</tbody></table></div>';

    // Most birdies
    html += '<div class="insight-card">';
    html += '<h4>🔴 Most Birdies</h4>';
    html += '<table class="insight-table"><thead><tr><th>Player</th><th>Birdies</th><th>Eagles</th></tr></thead><tbody>';
    for (const p of mostBirdies) {
        html += '<tr><td>' + escapeHtml(displayName(p.name)) + '</td>';
        html += '<td><strong>🔴 ' + p.birdies + '</strong></td>';
        html += '<td>' + (p.eagles > 0 ? '🟡 ' + p.eagles : '-') + '</td></tr>';
    }
    html += '</tbody></table></div>';

    // Most pars (consistency)
    html += '<div class="insight-card">';
    html += '<h4>🟢 Consistency Kings</h4>';
    html += '<table class="insight-table"><thead><tr><th>Player</th><th>Pars</th><th>Par %</th></tr></thead><tbody>';
    for (const p of mostPars) {
        const pct = p.filledHoles > 0 ? (p.pars / p.filledHoles * 100).toFixed(0) : 0;
        html += '<tr><td>' + escapeHtml(displayName(p.name)) + '</td>';
        html += '<td><strong>🟢 ' + p.pars + '</strong></td>';
        html += '<td>' + pct + '%</td></tr>';
    }
    html += '</tbody></table></div>';

    // Eagles club
    if (eaglePlayers.length > 0) {
        html += '<div class="insight-card">';
        html += '<h4>🦅 Hole Eagles Club</h4>';
        html += '<table class="insight-table"><thead><tr><th>Player</th><th>Holes Eagled</th></tr></thead><tbody>';
        for (const p of eaglePlayers) {
            html += '<tr><td>' + escapeHtml(displayName(p.name)) + '</td>';
            html += '<td><strong>🟡 ' + p.eagles + '</strong></td></tr>';
        }
        html += '</tbody></table></div>';
    }

    // Best scores per hole
    html += '<div class="insight-card insight-wide">';
    html += '<h4>🏆 Course Record Card — Best Eclectic Score Per Hole</h4>';
    html += '<table class="insight-table"><thead><tr><th>Hole</th>';
    for (let h = 1; h <= 18; h++) html += '<th>' + h + '</th>';
    html += '<th>Total</th></tr></thead><tbody>';
    // Par row
    html += '<tr class="par-row"><td><strong>Par</strong></td>';
    for (let h = 0; h < 18; h++) html += '<td>' + COURSE.par[h] + '</td>';
    html += '<td><strong>' + coursePar + '</strong></td></tr>';
    // Best score row
    html += '<tr><td><strong>Best</strong></td>';
    let bestTotal = 0;
    for (let h = 0; h < 18; h++) {
        const s = holeStats[h].bestScore;
        bestTotal += (s || 0);
        const diff = s !== null ? s - COURSE.par[h] : 0;
        const style = s !== null ? getScoreCellStyle(diff) : '';
        html += '<td' + (style ? ' style="' + style + '"' : '') + '>' + (s !== null ? s : '-') + '</td>';
    }
    html += '<td><strong>' + bestTotal + '</strong></td></tr>';
    // Who holds it — just show count, full names on hover tooltip
    html += '<tr><td><strong>Held by</strong></td>';
    for (let h = 0; h < 18; h++) {
        const allNames = holeStats[h].bestPlayers.map(n => displayName(n));
        const count = allNames.length;
        const tooltip = allNames.join('&#10;');
        const label = count === 1 ? '1 player' : count + ' players';
        html += '<td class="record-holder" title="' + tooltip + '">' + label + '</td>';
    }
    html += '<td></td></tr>';
    html += '</tbody></table></div>';

    // Front 9 / Back 9 records
    if (bestFront9 || bestBack9) {
        html += '<div class="insight-card">';
        html += '<h4>⛳ 9-Hole Records</h4>';
        html += '<table class="insight-table"><thead><tr><th></th><th>Player</th><th>Score</th><th>vs Par</th></tr></thead><tbody>';
        if (bestFront9) {
            const diff = bestFront9.score - frontPar;
            html += '<tr><td><strong>Front 9</strong></td><td>' + escapeHtml(displayName(bestFront9.name)) + '</td>';
            html += '<td><strong>' + bestFront9.score + '</strong></td>';
            html += '<td>' + (diff >= 0 ? '+' : '') + diff + '</td></tr>';
        }
        if (bestBack9) {
            const diff = bestBack9.score - backPar;
            html += '<tr><td><strong>Back 9</strong></td><td>' + escapeHtml(displayName(bestBack9.name)) + '</td>';
            html += '<td><strong>' + bestBack9.score + '</strong></td>';
            html += '<td>' + (diff >= 0 ? '+' : '') + diff + '</td></tr>';
        }
        html += '</tbody></table></div>';
    }

    // "One to go" players
    if (oneToGo.length > 0) {
        html += '<div class="insight-card">';
        html += '<h4>🔜 One Hole to Go!</h4>';
        html += '<p class="insight-subtitle">Players missing just 1 hole to complete their eclectic card</p>';
        html += '<table class="insight-table"><thead><tr><th>Player</th><th>Missing Hole</th></tr></thead><tbody>';
        for (const p of oneToGo) {
            html += '<tr><td>' + escapeHtml(displayName(p.name)) + '</td>';
            html += '<td>Hole <strong>' + p.missingHole + '</strong> (Par ' + COURSE.par[p.missingHole - 1] + ')</td></tr>';
        }
        html += '</tbody></table></div>';
    }

    // Scoring distribution per hole
    html += '<div class="insight-card insight-wide">';
    html += '<h4>📈 Scoring Distribution by Hole</h4>';
    html += '<table class="insight-table sortable-table" id="scoring-dist-table"><thead><tr>';
    html += '<th class="sortable" data-col="0" data-type="num">Hole ⇅</th>';
    html += '<th class="sortable" data-col="1" data-type="num">Par ⇅</th>';
    html += '<th class="sortable" data-col="2" data-type="num">🟡 Eagle ⇅</th>';
    html += '<th class="sortable" data-col="3" data-type="num">🔴 Birdie ⇅</th>';
    html += '<th class="sortable" data-col="4" data-type="num">🟢 Par ⇅</th>';
    html += '<th class="sortable" data-col="5" data-type="num">Bogey ⇅</th>';
    html += '<th class="sortable" data-col="6" data-type="num">Double+ ⇅</th>';
    html += '<th class="sortable" data-col="7" data-type="num">Par-or-better % ⇅</th>';
    html += '</tr></thead><tbody>';
    for (const h of holeStats) {
        const parOrBetter = h.count > 0 ? ((h.eagles + h.birdies + h.pars) / h.count * 100).toFixed(0) : 0;
        html += '<tr>';
        html += '<td><strong>' + h.hole + '</strong></td><td>' + h.par + '</td>';
        html += '<td>' + (h.eagles || '0') + '</td>';
        html += '<td>' + (h.birdies || '0') + '</td>';
        html += '<td>' + h.pars + '</td>';
        html += '<td>' + h.bogeys + '</td>';
        html += '<td>' + (h.doubles + h.worse) + '</td>';
        html += '<td><strong>' + parOrBetter + '%</strong></td></tr>';
    }
    html += '</tbody></table></div>';

    html += '</div>';
    return html;
}

// ============ NETT ECLECTIC INSIGHTS ============

function renderNettEclecticInsights(data) {
    if (!data || !data.players || data.players.length === 0) {
        return '<p class="status-msg info">No eclectic data available for nett insights.</p>';
    }

    const players = data.players;
    const nettPlayers = players.filter(p => p.gross !== null && p.handicap !== null && p.net !== null);
    if (nettPlayers.length === 0) {
        return '<p class="status-msg info">No players with complete cards and handicaps yet.</p>';
    }

    const year = data.year || new Date().getFullYear();
    const coursePar = COURSE.par.reduce((a, b) => a + b, 0);

    // Sort by nett
    const byNett = [...nettPlayers].sort((a, b) => {
        if (a.net !== b.net) return a.net - b.net;
        if (a.back9Net !== b.back9Net) return a.back9Net - b.back9Net;
        if (a.back6Net !== b.back6Net) return a.back6Net - b.back6Net;
        if (a.back3Net !== b.back3Net) return a.back3Net - b.back3Net;
        return a.lastHoleNet - b.lastHoleNet;
    });
    // Leader's countback note (compared to whoever is closest behind on equal net)
    let nettLeaderTieNote = '';
    if (byNett.length > 1 && byNett[0].net === byNett[1].net) {
        const a = byNett[0], b = byNett[1];
        if (a.back9Net !== b.back9Net)      nettLeaderTieNote = 'last 9';
        else if (a.back6Net !== b.back6Net) nettLeaderTieNote = 'last 6';
        else if (a.back3Net !== b.back3Net) nettLeaderTieNote = 'last 3';
        else if (a.lastHoleNet !== b.lastHoleNet) nettLeaderTieNote = 'last hole';
    }

    // Handicap advantage — who benefits most from their handicap
    const handicapValue = nettPlayers.map(p => {
        const grossRank = [...nettPlayers].sort((a, b) => a.gross - b.gross).findIndex(x => x.name === p.name) + 1;
        const nettRank = [...nettPlayers].sort((a, b) => a.net - b.net).findIndex(x => x.name === p.name) + 1;
        return { name: p.name, handicap: p.handicap, gross: p.gross, net: p.net, grossRank, nettRank, climb: grossRank - nettRank };
    }).sort((a, b) => b.climb - a.climb);

    // Best nett vs par
    const bestNettVsPar = byNett.slice(0, 5).map(p => ({
        name: p.name, net: p.net, handicap: p.handicap, gross: p.gross,
        vsPar: p.net - coursePar
    }));

    // Handicap breakdown bands
    const bands = [
        { label: '0–9', min: 0, max: 9 },
        { label: '10–18', min: 10, max: 18 },
        { label: '19–28', min: 19, max: 28 },
        { label: '29+', min: 29, max: 99 }
    ];
    const bandStats = bands.map(band => {
        const inBand = nettPlayers.filter(p => p.handicap >= band.min && p.handicap <= band.max);
        if (inBand.length === 0) return { ...band, count: 0, avgGross: 0, avgNett: 0, bestNett: null };
        const avgGross = inBand.reduce((a, p) => a + p.gross, 0) / inBand.length;
        const avgNett = inBand.reduce((a, p) => a + p.net, 0) / inBand.length;
        const best = inBand.sort((a, b) => a.net - b.net)[0];
        return { ...band, count: inBand.length, avgGross: avgGross, avgNett: avgNett, bestNett: best };
    });

    // Nett hole analysis — using stroke allocation
    const nettHoleStats = [];
    for (let h = 0; h < 18; h++) {
        const par = COURSE.par[h];
        let nettBirdies = 0, nettPars = 0, nettBogeys = 0, nettTotal = 0, count = 0;
        for (const p of nettPlayers) {
            const s = p.scores[h];
            if (s === null) continue;
            const strokes = getStrokesOnHole(p.handicap, h);
            const nettScore = s - strokes;
            const diff = nettScore - par;
            count++;
            nettTotal += nettScore;
            if (diff <= -1) nettBirdies++;
            else if (diff === 0) nettPars++;
            else nettBogeys++;
        }
        nettHoleStats.push({
            hole: h + 1, par, si: COURSE.si[h],
            avgNett: count > 0 ? nettTotal / count : 0,
            nettBirdies, nettPars, nettBogeys, count,
            nettParRate: count > 0 ? ((nettBirdies + nettPars) / count * 100) : 0
        });
    }

    // Closest nett to scratch
    const closestToScratch = byNett.slice(0, 5);

    // Per-player nett shot tallies on the eclectic card (albatross/eagle/birdie/par)
    const playerNettTallies = nettPlayers.map(p => {
        let na = 0, ne = 0, nb = 0, np = 0, filled = 0;
        const albatrossDetails = [];
        for (let h = 0; h < 18; h++) {
            const s = p.scores[h];
            if (s === null || s === undefined) continue;
            const strokes = getStrokesOnHole(p.handicap, h);
            const diff = (s - strokes) - COURSE.par[h];
            filled++;
            if (diff <= -3) {
                na++;
                albatrossDetails.push({
                    hole: h + 1,
                    par: COURSE.par[h],
                    si: COURSE.si[h],
                    gross: s,
                    strokes,
                    nett: s - strokes,
                    diff
                });
            }
            else if (diff === -2) ne++;
            else if (diff === -1) nb++;
            else if (diff === 0) np++;
        }
        return {
            name: p.name, handicap: p.handicap, net: p.net, gross: p.gross,
            nettAlbatrosses: na, nettEagles: ne, nettBirdies: nb, nettPars: np, filledHoles: filled,
            albatrossDetails
        };
    });
    const totalNettAlbatrosses = playerNettTallies.reduce((a, p) => a + p.nettAlbatrosses, 0);
    const totalNettEagles = playerNettTallies.reduce((a, p) => a + p.nettEagles, 0);
    const totalNettBirdies = playerNettTallies.reduce((a, p) => a + p.nettBirdies, 0);
    const totalNettPars = playerNettTallies.reduce((a, p) => a + p.nettPars, 0);
    const mostNettBirdies = [...playerNettTallies]
        .sort((a, b) => b.nettBirdies - a.nettBirdies
            || b.nettAlbatrosses - a.nettAlbatrosses
            || b.nettEagles - a.nettEagles)
        .slice(0, 5);
    const mostNettPars = [...playerNettTallies]
        .sort((a, b) => b.nettPars - a.nettPars
            || (b.nettPars / Math.max(1, b.filledHoles)) - (a.nettPars / Math.max(1, a.filledHoles)))
        .slice(0, 5);
    const nettEaglePlayers = playerNettTallies
        .filter(p => p.nettEagles > 0)
        .sort((a, b) => b.nettEagles - a.nettEagles);
    const nettAlbatrossPlayers = playerNettTallies
        .filter(p => p.nettAlbatrosses > 0)
        .sort((a, b) => b.nettAlbatrosses - a.nettAlbatrosses);

    // ---- BUILD HTML ----
    let html = '<div class="insights-grid">';

    // Eclectic-card-derived overview (mirrors Gross Insights banner)
    html += '<div class="insight-card insight-wide">';
    html += '<h4>📊 Nett Season Overview</h4>';
    html += '<div class="insight-stats">';
    html += '<div class="stat-item"><span class="stat-num">' + players.length + '</span><span class="stat-label">Players</span></div>';
    html += '<div class="stat-item"><span class="stat-num">' + nettPlayers.length + '</span><span class="stat-label">Full Cards</span></div>';
    html += '<div class="stat-item"><span class="stat-num">' + totalNettEagles + '</span><span class="stat-label">🟡 Nett Eagles</span></div>';
    if (totalNettAlbatrosses > 0) {
        html += '<div class="stat-item"><span class="stat-num">' + totalNettAlbatrosses + '</span><span class="stat-label">🦅 Nett Albatross</span></div>';
    }
    html += '<div class="stat-item"><span class="stat-num">' + totalNettBirdies + '</span><span class="stat-label">🔴 Nett Birdies</span></div>';
    html += '<div class="stat-item"><span class="stat-num">' + totalNettPars + '</span><span class="stat-label">🟢 Nett Pars</span></div>';
    if (byNett.length > 0) {
        html += '<div class="stat-item"><span class="stat-num">' + byNett[0].net + '</span><span class="stat-label">Best Nett</span></div>';
    }
    html += '</div></div>';

    // Overview
    html += '<div class="insight-card insight-wide">';
    html += '<h4>🎯 Nett Field Snapshot</h4>';
    html += '<div class="insight-stats">';
    html += '<div class="stat-item"><span class="stat-num">' + nettPlayers.length + '</span><span class="stat-label">Full Nett Cards</span></div>';
    html += '<div class="stat-item"><span class="stat-num">' + byNett[0].net + '</span><span class="stat-label">Best Nett</span></div>';
    html += '<div class="stat-item"><span class="stat-num">' + escapeHtml(displayName(byNett[0].name)) + (nettLeaderTieNote ? ' <span class="tie-note">(' + nettLeaderTieNote + ')</span>' : '') + '</span><span class="stat-label">Nett Leader</span></div>';
    const avgNett = (nettPlayers.reduce((a, p) => a + p.net, 0) / nettPlayers.length).toFixed(1);
    html += '<div class="stat-item"><span class="stat-num">' + avgNett + '</span><span class="stat-label">Avg Nett</span></div>';
    const avgHcap = (nettPlayers.reduce((a, p) => a + p.handicap, 0) / nettPlayers.length).toFixed(1);
    html += '<div class="stat-item"><span class="stat-num">' + avgHcap + '</span><span class="stat-label">Avg Handicap</span></div>';
    html += '</div></div>';

    // Best nett scores
    html += '<div class="insight-card">';
    html += '<h4>🏆 Best Nett Scores</h4>';
    html += '<table class="insight-table"><thead><tr><th>Player</th><th>Gross</th><th>H\'cap</th><th>Nett</th><th>vs Par</th></tr></thead><tbody>';
    for (const p of bestNettVsPar) {
        const sign = p.vsPar >= 0 ? '+' : '';
        const color = p.vsPar < 0 ? '#1a5e1a' : '#c00';
        html += '<tr><td>' + escapeHtml(displayName(p.name)) + '</td>';
        html += '<td>' + p.gross + '</td><td>' + p.handicap + '</td>';
        html += '<td><strong>' + p.net + '</strong></td>';
        html += '<td style="color:' + color + ';font-weight:700">' + sign + p.vsPar + '</td></tr>';
    }
    html += '</tbody></table></div>';

    // Most Nett Birdies (eclectic card)
    html += '<div class="insight-card">';
    html += '<h4>🔴 Most Nett Birdies</h4>';
    html += '<table class="insight-table"><thead><tr><th>Player</th><th>Birdies</th><th>Eagles</th></tr></thead><tbody>';
    for (const p of mostNettBirdies) {
        html += '<tr><td>' + escapeHtml(displayName(p.name)) + '</td>';
        html += '<td><strong>🔴 ' + p.nettBirdies + '</strong></td>';
        html += '<td>' + (p.nettEagles > 0 ? '🟡 ' + p.nettEagles : '-') + '</td></tr>';
    }
    html += '</tbody></table></div>';

    // Consistency Kings (Nett)
    html += '<div class="insight-card">';
    html += '<h4>🟢 Consistency Kings (Nett)</h4>';
    html += '<table class="insight-table"><thead><tr><th>Player</th><th>Pars</th><th>Par %</th></tr></thead><tbody>';
    for (const p of mostNettPars) {
        const pct = p.filledHoles > 0 ? (p.nettPars / p.filledHoles * 100).toFixed(0) : 0;
        html += '<tr><td>' + escapeHtml(displayName(p.name)) + '</td>';
        html += '<td><strong>🟢 ' + p.nettPars + '</strong></td>';
        html += '<td>' + pct + '%</td></tr>';
    }
    html += '</tbody></table></div>';

    // Most Nett Eagles (top 5)
    if (nettEaglePlayers.length > 0) {
        html += '<div class="insight-card">';
        html += '<h4>🦅 Most Nett Eagles</h4>';
        html += '<table class="insight-table"><thead><tr><th>Player</th><th>Eagles</th></tr></thead><tbody>';
        for (const p of nettEaglePlayers.slice(0, 5)) {
            html += '<tr><td>' + escapeHtml(displayName(p.name)) + '</td>';
            html += '<td><strong>🟡 ' + p.nettEagles + '</strong></td></tr>';
        }
        html += '</tbody></table></div>';
    }

    // Nett Albatross Club (rarer than eagle - diff <= -3)
    if (nettAlbatrossPlayers.length > 0) {
        // Helper: find the competition(s) where this player shot exactly `gross` on hole h (1-based)
        function findAlbatrossRound(playerName, hole, gross) {
            const matches = [];
            if (!appState || !Array.isArray(appState.competitions)) return matches;
            const target = (playerName || '').trim().toLowerCase();
            for (const comp of appState.competitions) {
                if (!comp || !comp.scorecards) continue;
                for (const cardName of Object.keys(comp.scorecards)) {
                    if (cardName.trim().toLowerCase() !== target) continue;
                    const card = comp.scorecards[cardName];
                    if (!card) continue;
                    if (card[hole - 1] === gross) {
                        matches.push({
                            name: (comp.info && comp.info.name) || comp.filename || 'Unknown competition',
                            date: (comp.info && comp.info.date) || ''
                        });
                    }
                }
            }
            return matches;
        }

        html += '<div class="insight-card insight-wide">';
        html += '<h4>🦅✨ Nett Albatross Club</h4>';
        html += '<p class="insight-subtitle">Three under net on a single hole — the rarest shot of the season</p>';
        html += '<table class="insight-table"><thead><tr>'
            + '<th>Player</th><th>H\'cap</th><th>Hole</th><th>Par</th>'
            + '<th>Gross</th><th>Strokes</th><th>Nett</th><th>Competition</th>'
            + '</tr></thead><tbody>';
        for (const p of nettAlbatrossPlayers) {
            const details = p.albatrossDetails && p.albatrossDetails.length
                ? p.albatrossDetails
                : [null];
            for (let i = 0; i < details.length; i++) {
                const d = details[i];
                html += '<tr>';
                if (i === 0) {
                    const rowspan = details.length > 1 ? ' rowspan="' + details.length + '"' : '';
                    html += '<td' + rowspan + '>' + escapeHtml(displayName(p.name)) + '</td>';
                    html += '<td' + rowspan + '>' + p.handicap + '</td>';
                }
                if (d) {
                    html += '<td>' + d.hole + ' <span style="color:#888;font-size:0.85em">(SI ' + d.si + ')</span></td>';
                    html += '<td>' + d.par + '</td>';
                    html += '<td><strong>' + d.gross + '</strong></td>';
                    html += '<td>' + d.strokes + '</td>';
                    html += '<td><strong>🦅 ' + d.nett + '</strong></td>';
                    const rounds = findAlbatrossRound(p.name, d.hole, d.gross);
                    let compCell;
                    if (rounds.length === 0) {
                        compCell = '<em style="color:#888">eclectic-only (round not traced)</em>';
                    } else if (rounds.length === 1) {
                        const r = rounds[0];
                        compCell = escapeHtml(r.name) + (r.date ? '<br><span style="color:#888;font-size:0.85em">' + escapeHtml(r.date) + '</span>' : '');
                    } else {
                        compCell = escapeHtml(rounds[0].name) + ' <span style="color:#888">(+' + (rounds.length - 1) + ' other round' + (rounds.length > 2 ? 's' : '') + ')</span>';
                    }
                    html += '<td>' + compCell + '</td>';
                } else {
                    html += '<td colspan="6"><strong>🦅 ' + p.nettAlbatrosses + '</strong></td>';
                }
                html += '</tr>';
            }
        }
        html += '</tbody></table></div>';
    }

    // Biggest climbers
    html += '<div class="insight-card">';
    html += '<h4>📈 Biggest Handicap Climbers</h4>';
    html += '<p class="insight-subtitle">Players who gain the most positions from gross to nett ranking</p>';
    html += '<table class="insight-table"><thead><tr><th>Player</th><th>H\'cap</th><th>Gross Rank</th><th>Nett Rank</th><th>Climb</th></tr></thead><tbody>';
    for (const p of handicapValue.slice(0, 5)) {
        html += '<tr><td>' + escapeHtml(displayName(p.name)) + '</td>';
        html += '<td>' + p.handicap + '</td>';
        html += '<td>' + p.grossRank + '</td>';
        html += '<td>' + p.nettRank + '</td>';
        html += '<td style="color:#1a5e1a;font-weight:700">↑' + p.climb + '</td></tr>';
    }
    html += '</tbody></table></div>';

    // Handicap band analysis
    html += '<div class="insight-card">';
    html += '<h4>📊 Handicap Band Analysis</h4>';
    html += '<table class="insight-table"><thead><tr><th>Band</th><th>Players</th><th>Avg Gross</th><th>Avg Nett</th><th>Best Nett</th></tr></thead><tbody>';
    for (const b of bandStats) {
        if (b.count === 0) continue;
        html += '<tr><td><strong>' + b.label + '</strong></td>';
        html += '<td>' + b.count + '</td>';
        html += '<td>' + b.avgGross.toFixed(1) + '</td>';
        html += '<td><strong>' + b.avgNett.toFixed(1) + '</strong></td>';
        html += '<td>' + (b.bestNett ? '<span title="' + escapeHtml(displayName(b.bestNett.name)) + '">' + escapeHtml(displayName(b.bestNett.name).substring(0, 15)) + '</span> (' + b.bestNett.net + ')' : '-') + '</td></tr>';
    }
    html += '</tbody></table></div>';

    // Nett scoring distribution by hole
    html += '<div class="insight-card insight-wide">';
    html += '<h4>📈 Nett Scoring by Hole (after handicap strokes)</h4>';
    html += '<table class="insight-table sortable-table" id="nett-scoring-dist-table"><thead><tr>';
    html += '<th class="sortable" data-col="0" data-type="num">Hole ⇅</th>';
    html += '<th class="sortable" data-col="1" data-type="num">Par ⇅</th>';
    html += '<th class="sortable" data-col="2" data-type="num">SI ⇅</th>';
    html += '<th class="sortable" data-col="3" data-type="num">Avg Nett ⇅</th>';
    html += '<th class="sortable" data-col="4" data-type="num">Nett Birdies ⇅</th>';
    html += '<th class="sortable" data-col="5" data-type="num">Nett Pars ⇅</th>';
    html += '<th class="sortable" data-col="6" data-type="num">Nett Bogey+ ⇅</th>';
    html += '<th class="sortable" data-col="7" data-type="num">Nett Par% ⇅</th>';
    html += '</tr></thead><tbody>';
    for (const h of nettHoleStats) {
        html += '<tr>';
        html += '<td><strong>' + h.hole + '</strong></td>';
        html += '<td>' + h.par + '</td>';
        html += '<td>' + h.si + '</td>';
        html += '<td>' + h.avgNett.toFixed(2) + '</td>';
        html += '<td>' + h.nettBirdies + '</td>';
        html += '<td>' + h.nettPars + '</td>';
        html += '<td>' + h.nettBogeys + '</td>';
        html += '<td><strong>' + h.nettParRate.toFixed(0) + '%</strong></td>';
        html += '</tr>';
    }
    html += '</tbody></table></div>';

    html += '</div>';
    return html;
}

function shortenCompName(name) {
    return name
        .replace(/Men's\s*/gi, '')
        .replace(/Singles\s*/gi, '')
        .replace(/\s*-\s*\d{1,2}(?:st|nd|rd|th)?\s*[\/&]\s*\d{1,2}(?:st|nd|rd|th)?\s+\w+\s+\d{4}/gi, '')
        .replace(/\s*\(.+?\)/g, '')
        .trim()
        .substring(0, 20);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============ SORTABLE TABLES ============

function initSortableTables() {
    document.querySelectorAll('.sortable').forEach(th => {
        th.style.cursor = 'pointer';
        th.addEventListener('click', function() {
            const table = this.closest('table');
            const tbody = table.querySelector('tbody');
            const col = parseInt(this.dataset.col);
            const type = this.dataset.type || 'text';
            const rows = Array.from(tbody.querySelectorAll('tr'));
            const currentDir = this.dataset.dir || 'asc';
            const newDir = currentDir === 'asc' ? 'desc' : 'asc';

            // Reset all headers in this table
            table.querySelectorAll('.sortable').forEach(h => { h.dataset.dir = ''; });
            this.dataset.dir = newDir;

            rows.sort((a, b) => {
                let va = a.cells[col].textContent.replace('%', '').trim();
                let vb = b.cells[col].textContent.replace('%', '').trim();
                if (type === 'num') {
                    va = parseFloat(va) || 0;
                    vb = parseFloat(vb) || 0;
                    return newDir === 'asc' ? va - vb : vb - va;
                }
                return newDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
            });

            rows.forEach(r => tbody.appendChild(r));
        });
    });
}

// ============ UI FUNCTIONS ============

function initUI() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });
    uploadArea.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON') fileInput.click();
    });
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
        fileInput.value = '';
    });
}

function handleFiles(files) {
    const promises = [];
    for (const file of files) {
        if (!file.name.endsWith('.csv')) {
            alert('Skipping ' + file.name + ' - only CSV files are supported');
            continue;
        }
        promises.push(new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const result = processUploadedFile(e.target.result, file.name);
                resolve({ filename: file.name, result });
            };
            reader.readAsText(file);
        }));
    }

    Promise.all(promises).then(results => {
        let hasData = false;
        for (const { filename, result } of results) {
            if (result.error) {
                alert('Error processing ' + filename + ': ' + result.error);
            } else {
                hasData = true;
                if (result.type === 'eclectic') {
                    // Auto-generate eclectic tables when eclectic CSV is loaded
                    generateTables();
                }
            }
        }
        if (hasData) {
            saveToStorage();
            renderCompetitionsTable();
            renderFixtureTracker();
        }
    });
}

function renderCompetitionsTable() {
    const section = document.getElementById('competitions-section');
    const tbody = document.querySelector('#competitions-table tbody');

    // Show section if we have competitions OR eclectic data
    if (appState.competitions.length === 0 && !appState.eclecticData) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';
    tbody.innerHTML = '';

    // Show eclectic data as a row if loaded
    if (appState.eclecticData) {
        const d = appState.eclecticData;
        const tr = document.createElement('tr');
        tr.innerHTML =
            '<td style="text-align:left">⛳ Eclectic Cup (' + (d.year || '?') + ')</td>' +
            '<td>' + (d.printDate || '-') + '</td>' +
            '<td>' + d.players.length + '</td>' +
            '<td>Eclectic CSV</td>' +
            '<td>-</td>' +
            '<td>-</td>' +
            '<td><button class="btn btn-danger" onclick="clearEclectic()">✕</button></td>';
        tbody.appendChild(tr);
    }

    // Competitions folded into a primary row (see foldCompetitionsIntoPrimary) are
    // hidden here so a multi-day report that spans two separately loaded daily
    // scorecard competitions shows as one row, not two. Their underlying data stays
    // in appState.competitions untouched so GOY/Eclectic calculations still see it.
    for (const comp of [...appState.competitions].filter(c => !c.hidden).sort((a, b) => {
        // Sort by latest played date descending (most recent first), using the
        // last actual date within a multi-day competition (not the first, see
        // extractLatestDateKey) so display ordering matches handicap chronology.
        // Fall back to name when no date.
        const da = extractLatestDateKey(a.info.date) || '';
        const db = extractLatestDateKey(b.info.date) || '';
        if (da && db) return db.localeCompare(da);
        if (da) return -1;
        if (db) return 1;
        return (a.info.name || '').localeCompare(b.info.name || '');
    })) {
        const mergedComps = (comp.mergedCompetitionIds || [])
            .map(id => appState.competitions.find(c => c.id === id))
            .filter(Boolean);
        const playerCount = comp.hasScorecard
            ? new Set([
                ...Object.keys(comp.scorecards),
                ...mergedComps.flatMap(c => Object.keys(c.scorecards || {}))
            ]).size
            : comp.results.length;
        // Show auto-detect badge
        const autoTag = comp.fixtureMatch
            ? ' <span class="auto-badge" title="Auto-detected from fixture list: ' + escapeHtml(comp.fixtureMatch) + '">AUTO</span>'
            : '';

        const tr = document.createElement('tr');
        tr.innerHTML =
            '<td style="text-align:left">' + escapeHtml(comp.info.name || comp.filename) + autoTag + '</td>' +
            '<td>' + escapeHtml(comp.info.date || '-') + '</td>' +
            '<td>' + playerCount + '</td>' +
            '<td><input type="checkbox" ' + (comp.config.isGOY ? 'checked' : '') + ' ' +
                (!comp.hasReport ? 'disabled title="Needs Competition Report CSV"' : '') +
                ' onchange="toggleConfig(\'' + comp.id + '\',\'isGOY\',this.checked)"></td>' +
            '<td><button class="btn btn-danger" onclick="removeCompetition(\'' + comp.id + '\')">✕</button></td>';
        tbody.appendChild(tr);
    }
}

function toggleConfig(compId, key, value) {
    const comp = appState.competitions.find(c => c.id === compId);
    if (comp) { comp.config[key] = value; saveToStorage(); }
}

function removeCompetition(compId) {
    const comp = appState.competitions.find(c => c.id === compId);
    // Removing a row that folded other daily scorecard competitions into itself
    // must also remove those hidden duplicates, otherwise their scorecards would
    // keep feeding the Eclectic calculation after the visible row is gone.
    const idsToRemove = new Set([compId]);
    if (comp && comp.mergedCompetitionIds) {
        for (const id of comp.mergedCompetitionIds) idsToRemove.add(id);
    }
    appState.competitions = appState.competitions.filter(c => !idsToRemove.has(c.id));
    saveToStorage();
    renderCompetitionsTable();
    if (appState.competitions.length === 0 && !appState.eclecticData) {
        document.getElementById('competitions-section').style.display = 'none';
        document.getElementById('results-section').style.display = 'none';
    }
}

function clearEclectic() {
    appState.eclecticData = null;
    saveToStorage();
    renderCompetitionsTable();
    document.getElementById('eclectic-gross-table-container').innerHTML = '';
    document.getElementById('eclectic-nett-table-container').innerHTML = '';
    if (appState.competitions.length === 0) {
        document.getElementById('competitions-section').style.display = 'none';
        document.getElementById('results-section').style.display = 'none';
    }
}

function clearAllData() {
    appState.competitions = [];
    appState.goyResults = null;
    appState.eclecticData = null;
    localStorage.removeItem(STORAGE_KEY);
    document.getElementById('competitions-section').style.display = 'none';
    document.getElementById('results-section').style.display = 'none';
}

function generateTables() {
    appState.goyResults = calculateGOY();

    // Calculate eclectic from scorecards if no dedicated eclectic CSV was uploaded
    const eclecticSource = appState.eclecticData || calculateEclecticFromScorecards();

    document.getElementById('goy-table-container').innerHTML = renderGOYTable(appState.goyResults);
    document.getElementById('eclectic-gross-table-container').innerHTML = renderEclecticGrossTable(eclecticSource);
    document.getElementById('eclectic-nett-table-container').innerHTML = renderEclecticNettTable(eclecticSource);
    document.getElementById('eclectic-insights-container').innerHTML = renderEclecticInsights(eclecticSource);
    document.getElementById('eclectic-nett-insights-container').innerHTML = renderNettEclecticInsights(eclecticSource);

    renderPalsPicker();
    renderHeadToHead();

    const section = document.getElementById('results-section');
    section.style.display = 'block';
    section.scrollIntoView({ behavior: 'smooth' });
    initSortableTables();
}

function switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelector('[onclick="switchTab(\'' + tabId + '\')"]').classList.add('active');
    document.getElementById('tab-' + tabId).classList.add('active');
    if (tabId === 'buddy-battle') {
        // Focus the search input for fast typing
        const input = document.getElementById('h2h-search-input');
        if (input) setTimeout(() => input.focus(), 50);
    }
}

// ============ BUDDY BATTLE ENGINE ============

function loadPalsFromStorage() {
    try {
        const raw = localStorage.getItem(PALS_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            appState.pals = parsed.filter(n => typeof n === 'string').slice(0, MAX_PALS);
        }
    } catch (e) { /* ignore */ }
}

function savePalsToStorage() {
    try {
        localStorage.setItem(PALS_STORAGE_KEY, JSON.stringify(appState.pals));
    } catch (e) { /* ignore */ }
}

function getAllPlayerNames() {
    const names = new Set();
    // From GOY results
    for (const comp of appState.competitions) {
        if (comp.results) {
            for (const r of comp.results) {
                if (r.playerName) names.add(r.playerName.trim());
            }
        }
        if (comp.scorecards) {
            for (const n of Object.keys(comp.scorecards)) names.add(n.trim());
        }
        if (comp.handicaps) {
            for (const n of Object.keys(comp.handicaps)) names.add(n.trim());
        }
    }
    // From eclectic data (if uploaded as a dedicated CSV)
    if (appState.eclecticData && appState.eclecticData.players) {
        for (const p of appState.eclecticData.players) names.add(p.name.trim());
    }
    // Sort by the displayed form (first name first) so the dropdown reads alphabetically as the user scans it.
    return Array.from(names).sort((a, b) => displayName(a).localeCompare(displayName(b)));
}

function normalisePalName(name) { return (name || '').trim().toLowerCase(); }

function addPal(name) {
    const clean = (name || '').trim();
    if (!clean) return;
    const norm = normalisePalName(clean);
    if (appState.pals.some(n => normalisePalName(n) === norm)) return; // already added
    if (appState.pals.length >= MAX_PALS) {
        alert('You can compare up to ' + MAX_PALS + ' players. Remove one first.');
        return;
    }
    appState.pals.push(clean);
    savePalsToStorage();
    renderPalsPicker();
    renderHeadToHead();
}

function removePal(name) {
    const norm = normalisePalName(name);
    appState.pals = appState.pals.filter(n => normalisePalName(n) !== norm);
    savePalsToStorage();
    renderPalsPicker();
    renderHeadToHead();
}

function clearAllPals() {
    if (appState.pals.length === 0) return;
    if (!confirm('Clear all selected players?')) return;
    appState.pals = [];
    savePalsToStorage();
    renderPalsPicker();
    renderHeadToHead();
}

function renderPalsPicker() {
    const chipsEl = document.getElementById('h2h-chips');
    const countEl = document.getElementById('h2h-count');
    if (!chipsEl) return;
    if (appState.pals.length === 0) {
        chipsEl.innerHTML = '<span class="h2h-chips-empty">No players selected yet — start typing above.</span>';
    } else {
        chipsEl.innerHTML = appState.pals.map(name =>
            '<span class="h2h-chip">' + escapeHtml(displayName(name)) +
            '<button class="h2h-chip-remove" title="Remove" onclick="removePal(' + JSON.stringify(name).replace(/"/g, '&quot;') + ')">✕</button></span>'
        ).join('');
    }
    if (countEl) {
        countEl.textContent = appState.pals.length + ' / ' + MAX_PALS + ' selected';
    }
}

function initPalsSearch() {
    const input = document.getElementById('h2h-search-input');
    const dropdown = document.getElementById('h2h-search-dropdown');
    if (!input || !dropdown) return;
    let activeIndex = -1;

    function closeDropdown() {
        dropdown.hidden = true;
        dropdown.innerHTML = '';
        activeIndex = -1;
    }

    function renderResults(matches) {
        if (matches.length === 0) {
            dropdown.innerHTML = '<div class="h2h-dropdown-empty">No matching players.</div>';
        } else {
            dropdown.innerHTML = matches.map((name, i) => {
                const isAdded = appState.pals.some(p => normalisePalName(p) === normalisePalName(name));
                const cls = 'h2h-dropdown-item' + (isAdded ? ' disabled' : '') + (i === activeIndex ? ' active' : '');
                const label = escapeHtml(displayName(name)) + (isAdded ? ' <span style="font-size:0.8em">(already added)</span>' : '');
                return '<div class="' + cls + '" data-name="' + escapeHtml(name) + '" data-index="' + i + '">' + label + '</div>';
            }).join('');
            dropdown.querySelectorAll('.h2h-dropdown-item').forEach(el => {
                el.addEventListener('mousedown', (ev) => {
                    ev.preventDefault();
                    if (el.classList.contains('disabled')) return;
                    addPal(el.dataset.name);
                    input.value = '';
                    closeDropdown();
                });
            });
        }
        dropdown.hidden = false;
    }

    function search(q) {
        const all = getAllPlayerNames();
        const needle = q.trim().toLowerCase();
        if (!needle) {
            // No query → no dropdown. Avoids looking like a canned list and keeps the picker quiet until the user types.
            closeDropdown();
            return;
        }
        const matches = all.filter(n => n.toLowerCase().includes(needle)).slice(0, 30);
        renderResults(matches);
    }

    input.addEventListener('focus', () => { if (input.value.trim()) search(input.value); });
    input.addEventListener('input', () => { activeIndex = -1; search(input.value); });
    input.addEventListener('blur', () => setTimeout(closeDropdown, 150));
    input.addEventListener('keydown', (e) => {
        const items = Array.from(dropdown.querySelectorAll('.h2h-dropdown-item:not(.disabled)'));
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, items.length - 1);
            items.forEach(el => el.classList.remove('active'));
            if (items[activeIndex]) {
                items[activeIndex].classList.add('active');
                items[activeIndex].scrollIntoView({ block: 'nearest' });
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
            items.forEach(el => el.classList.remove('active'));
            if (items[activeIndex]) {
                items[activeIndex].classList.add('active');
                items[activeIndex].scrollIntoView({ block: 'nearest' });
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (items[activeIndex]) {
                addPal(items[activeIndex].dataset.name);
            } else if (items.length === 1) {
                addPal(items[0].dataset.name);
            }
            input.value = '';
            closeDropdown();
        } else if (e.key === 'Escape') {
            closeDropdown();
        }
    });
}

function buildEclecticRankMaps(data) {
    if (!data || !data.players || data.players.length === 0) return null;
    const grossSorted = [...data.players].sort((a, b) =>
        (a.gross ?? Infinity) - (b.gross ?? Infinity) ||
        a.back9Gross - b.back9Gross ||
        a.back6Gross - b.back6Gross ||
        a.back3Gross - b.back3Gross ||
        a.lastHoleGross - b.lastHoleGross
    );
    const nettSorted = [...data.players].sort((a, b) =>
        (a.net ?? Infinity) - (b.net ?? Infinity) ||
        a.back9Net - b.back9Net ||
        a.back6Net - b.back6Net ||
        a.back3Net - b.back3Net ||
        a.lastHoleNet - b.lastHoleNet
    );
    const grossRank = new Map();
    grossSorted.forEach((p, i) => grossRank.set(normalisePalName(p.name), i + 1));
    const nettRank = new Map();
    nettSorted.forEach((p, i) => nettRank.set(normalisePalName(p.name), i + 1));
    return { grossRank, nettRank, total: data.players.length };
}

function renderHeadToHead() {
    const container = document.getElementById('buddy-battle-table-container');
    if (!container) return;

    if (appState.pals.length === 0) {
        container.innerHTML =
            '<div class="h2h-empty-state">' +
            '<span class="emoji">👥</span>' +
            '<p>Add buddies above to start a buddy battle.</p>' +
            '<p style="margin-top:0.4rem;font-size:0.9rem;">Tip: type a surname to find them quickly.</p>' +
            '</div>';
        return;
    }

    const goy = appState.goyResults || calculateGOY();
    const ecl = appState.eclecticData || calculateEclecticFromScorecards();
    const eclRanks = buildEclecticRankMaps(ecl);

    // Build a row per pal
    const rows = appState.pals.map(name => {
        const norm = normalisePalName(name);
        const goyRow = goy ? goy.leaderboard.find(p => normalisePalName(p.playerName) === norm) : null;
        const eclPlayer = (ecl && ecl.players) ? ecl.players.find(p => normalisePalName(p.name) === norm) : null;
        // Latest handicap fallback (from competitions)
        let hc = eclPlayer ? eclPlayer.handicap : null;
        if (hc === null || hc === undefined) {
            // Look in handicaps map
            for (const comp of appState.competitions) {
                if (comp.handicaps) {
                    for (const [n, h] of Object.entries(comp.handicaps)) {
                        if (normalisePalName(n) === norm && h !== undefined && h !== null) hc = h;
                    }
                }
            }
        }
        // Rounds played: count comps where this player has a scorecard
        let rounds = 0;
        for (const comp of appState.competitions) {
            if (comp.scorecards && Object.keys(comp.scorecards).some(n => normalisePalName(n) === norm)) {
                rounds++;
            }
        }
        return {
            name,
            handicap: hc,
            goyPts: goyRow ? goyRow.total : 0,
            goyCompCount: goyRow ? goyRow.compCount : 0,
            goyPosition: goyRow ? goyRow.position : null,
            eclGross: eclPlayer ? eclPlayer.gross : null,
            eclNet: eclPlayer ? eclPlayer.net : null,
            grossRank: (eclPlayer && eclRanks) ? eclRanks.grossRank.get(norm) : null,
            nettRank: (eclPlayer && eclRanks) ? eclRanks.nettRank.get(norm) : null,
            scores: eclPlayer ? eclPlayer.scores : null,
            rounds,
            back9Gross: eclPlayer ? eclPlayer.back9Gross : null,
            back9Net: eclPlayer ? eclPlayer.back9Net : null
        };
    });

    // Find leaders per metric for highlighting / takeaways
    function bestOf(arr, getter, lowerBetter = false) {
        let best = null;
        for (const r of arr) {
            const v = getter(r);
            if (v === null || v === undefined) continue;
            if (best === null || (lowerBetter ? v < getter(best) : v > getter(best))) best = r;
        }
        return best;
    }
    const goyLeader   = bestOf(rows, r => r.goyPts, false);
    // Use precomputed ranks (countback-aware: back-9 → back-6 → back-3 → 18th) so ties resolve correctly.
    const grossLeader = bestOf(rows.filter(r => r.eclGross !== null && r.eclGross !== undefined), r => r.grossRank, true);
    const nettLeader  = bestOf(rows.filter(r => r.eclNet   !== null && r.eclNet   !== undefined), r => r.nettRank,  true);
    const mostActive  = bestOf(rows, r => r.rounds, false);

    let html = '';

    // ----- Sort helpers (best at top) -----
    function _sortGoy(a, b) {
        const ap = a.goyPts || 0, bp = b.goyPts || 0;
        if (bp !== ap) return bp - ap; // higher GOY pts first
        const aPos = (a.goyPosition === null || a.goyPosition === undefined) ? Infinity : a.goyPosition;
        const bPos = (b.goyPosition === null || b.goyPosition === undefined) ? Infinity : b.goyPosition;
        return aPos - bPos;
    }
    function _sortGross(a, b) {
        const aR = a.grossRank || Infinity, bR = b.grossRank || Infinity;
        return aR - bR; // lower club rank = better, nulls last
    }
    function _sortNett(a, b) {
        const aR = a.nettRank || Infinity, bR = b.nettRank || Infinity;
        return aR - bR;
    }
    const goyOrder   = [...rows].sort(_sortGoy);
    const grossOrder = [...rows].sort(_sortGross);
    const nettOrder  = [...rows].sort(_sortNett);

    // ----- GOY -----
    html += '<div class="h2h-section">';
    html += '<h4>🏆 Golfer of the Year — Points</h4>';
    html += '<table class="h2h-table"><thead><tr>' +
        '<th>Player</th><th class="num">HC</th><th class="num">GOY Pts</th>' +
        '<th class="num">Top-20 Finishes</th><th class="num">Overall Rank</th></tr></thead><tbody>';
    for (const r of goyOrder) {
        const leader = goyLeader && r === goyLeader && r.goyPts > 0;
        html += '<tr' + (leader ? ' class="h2h-leader"' : '') + '>' +
            '<td>' + escapeHtml(displayName(r.name)) + '</td>' +
            '<td class="num">' + (r.handicap !== null && r.handicap !== undefined ? r.handicap : '—') + '</td>' +
            '<td class="num">' + (r.goyPts || 0) + '</td>' +
            '<td class="num">' + (r.goyCompCount || 0) + '</td>' +
            '<td class="num">' + (r.goyPosition ? r.goyPosition : '—') + '</td>' +
            '</tr>';
    }
    html += '</tbody></table></div>';

    // ----- Eclectic Gross -----
    html += '<div class="h2h-section">';
    html += '<h4>⛳ Eclectic Cup — Gross</h4>';
    html += '<table class="h2h-table"><thead><tr>' +
        '<th>Player</th><th class="num">HC</th><th class="num">Eclectic Gross</th>' +
        '<th class="num">Club Rank' + (eclRanks ? ' (of ' + eclRanks.total + ')' : '') + '</th>' +
        '<th class="num">Rounds</th></tr></thead><tbody>';
    for (const r of grossOrder) {
        const leader = grossLeader && r === grossLeader && r.eclGross !== null;
        html += '<tr' + (leader ? ' class="h2h-leader"' : '') + '>' +
            '<td>' + escapeHtml(displayName(r.name)) + '</td>' +
            '<td class="num">' + (r.handicap !== null && r.handicap !== undefined ? r.handicap : '—') + '</td>' +
            '<td class="num">' + (r.eclGross !== null ? r.eclGross : '—') + '</td>' +
            '<td class="num">' + (r.grossRank ? r.grossRank : '—') + '</td>' +
            '<td class="num">' + r.rounds + '</td>' +
            '</tr>';
    }
    html += '</tbody></table>';
    html += '<p class="help-text" style="margin-top:0.5rem;">Players need a valid score on every hole across the season to qualify for the eclectic. Ties resolved by back-9 → back-6 → back-3 → 18th countback (same as club rules).</p>';
    html += '</div>';

    // ----- Eclectic Nett -----
    html += '<div class="h2h-section">';
    html += '<h4>🎯 Eclectic Cup — Nett</h4>';
    html += '<table class="h2h-table"><thead><tr>' +
        '<th>Player</th><th class="num">HC</th><th class="num">Eclectic Nett</th>' +
        '<th class="num">Club Rank' + (eclRanks ? ' (of ' + eclRanks.total + ')' : '') + '</th>' +
        '<th class="num">Rounds</th></tr></thead><tbody>';
    for (const r of nettOrder) {
        const leader = nettLeader && r === nettLeader && r.eclNet !== null;
        html += '<tr' + (leader ? ' class="h2h-leader"' : '') + '>' +
            '<td>' + escapeHtml(displayName(r.name)) + '</td>' +
            '<td class="num">' + (r.handicap !== null && r.handicap !== undefined ? r.handicap : '—') + '</td>' +
            '<td class="num">' + (r.eclNet !== null ? r.eclNet : '—') + '</td>' +
            '<td class="num">' + (r.nettRank ? r.nettRank : '—') + '</td>' +
            '<td class="num">' + r.rounds + '</td>' +
            '</tr>';
    }
    html += '</tbody></table></div>';

    // ----- Hole-by-hole (only if at least one pal has eclectic data) -----
    const withScores = grossOrder.filter(r => r.scores);
    if (withScores.length > 0) {
        html += '<div class="h2h-section">';
        html += '<h4>📊 Eclectic Gross — hole by hole</h4>';
        html += '<div class="table-wrapper"><table class="h2h-table">';
        html += '<thead><tr><th>Player</th>';
        for (let i = 1; i <= 18; i++) html += '<th class="hole">' + i + '</th>';
        html += '<th class="num">Total</th></tr></thead><tbody>';
        // Par row
        html += '<tr><td><strong>Par</strong></td>';
        for (let i = 0; i < 18; i++) html += '<td class="hole">' + COURSE.par[i] + '</td>';
        html += '<td class="num"><strong>' + COURSE.totalPar + '</strong></td></tr>';
        for (const r of withScores) {
            html += '<tr><td>' + escapeHtml(displayName(r.name)) + '</td>';
            for (let i = 0; i < 18; i++) {
                const s = r.scores[i];
                const diff = s - COURSE.par[i];
                const style = getScoreCellStyle(diff);
                html += '<td class="hole" style="' + style + '">' + s + '</td>';
            }
            html += '<td class="num"><strong>' + r.eclGross + '</strong></td></tr>';
        }
        html += '</tbody></table></div></div>';
    }

    // ----- Banter takeaways -----
    html += buildBanterTakeaways(rows, ecl);

    container.innerHTML = html;
}

// ============ BANTER ENGINE ============
//
// Rule-based, fully local. No LLM, no network calls, no data leaves the browser.
// Each insight has multiple phrasings; a stable seed (group + date) selects which
// phrasing fires, so the banter feels fresh day-to-day but is consistent within a day.
//
function _h2hSeed(rows) {
    const names = rows.map(r => normalisePalName(r.name)).sort().join('|');
    const day = new Date().toISOString().slice(0, 10);
    const str = names + '|' + day;
    let h = 0;
    for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    return Math.abs(h);
}
function _pick(arr, seed, salt) { return arr[(seed + (salt || 0)) % arr.length]; }
function _strong(name) { return '<strong>' + escapeHtml(displayName(name)) + '</strong>'; }
function _plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

function _holePerformance(scores) {
    // Returns { par3, par4, par5, front9, back9, birdies, eagles, pars, bogeys, doublesPlus, holesAtOrUnderPar }
    if (!scores) return null;
    let par3 = 0, par4 = 0, par5 = 0, front9 = 0, back9 = 0;
    let birdies = 0, eagles = 0, pars = 0, bogeys = 0, doublesPlus = 0, holesAtOrUnderPar = 0;
    let par3Par = 0, par5Par = 0, par4Par = 0;
    for (let i = 0; i < 18; i++) {
        const s = scores[i], p = COURSE.par[i];
        if (s === null || s === undefined) continue;
        if (p === 3) { par3 += s; par3Par += p; }
        if (p === 4) { par4 += s; par4Par += p; }
        if (p === 5) { par5 += s; par5Par += p; }
        if (i < 9) front9 += s; else back9 += s;
        const d = s - p;
        if (d <= -2) eagles++;
        if (d === -1) birdies++;
        if (d === 0) pars++;
        if (d === 1) bogeys++;
        if (d >= 2) doublesPlus++;
        if (d <= 0) holesAtOrUnderPar++;
    }
    return { par3, par4, par5, front9, back9, birdies, eagles, pars, bogeys, doublesPlus, holesAtOrUnderPar, par3Par, par4Par, par5Par };
}

function buildBanterTakeaways(rows, ecl) {
    if (!rows || rows.length === 0) return '';
    const seed = _h2hSeed(rows);
    const takeaways = [];

    // Per-row precomputed stats
    for (const r of rows) r._perf = _holePerformance(r.scores);

    // ===== Helpers =====
    const withGross = rows.filter(r => r.eclGross !== null && r.eclGross !== undefined);
    const withNet   = rows.filter(r => r.eclNet   !== null && r.eclNet   !== undefined);
    const withScores = rows.filter(r => r.scores);
    const goyLeader = rows.reduce((b, r) => (!b || r.goyPts > b.goyPts ? r : b), null);
    // Use precomputed ranks (countback-aware) so the leader on a tied score is the one who wins on club countback.
    const grossLeader = withGross.length ? withGross.reduce((b, r) => (!b || (r.grossRank ?? Infinity) < (b.grossRank ?? Infinity) ? r : b), null) : null;
    const nettLeader  = withNet.length   ? withNet.reduce((b, r) => (!b || (r.nettRank  ?? Infinity) < (b.nettRank  ?? Infinity) ? r : b), null) : null;

    // ----- 1. GOY -----
    if (goyLeader && goyLeader.goyPts > 0) {
        const tiedTop = rows.filter(r => r.goyPts === goyLeader.goyPts);
        if (tiedTop.length > 1) {
            const names = tiedTop.map(r => _strong(r.name)).join(' & ');
            takeaways.push(_pick([
                names + ' are level on GOY points (' + goyLeader.goyPts + ' apiece).',
                'Dead heat at the top of the GOY column: ' + names + ' on ' + goyLeader.goyPts + '.',
                names + ' share the GOY lead with ' + goyLeader.goyPts + ' pts.'
            ], seed, 1));
        } else {
            const variants = [
                _strong(goyLeader.name) + ' leads on GOY points (' + _plural(goyLeader.goyPts, 'pt') + ' from ' + _plural(goyLeader.goyCompCount, 'event') + ').',
                _plural(goyLeader.goyPts, 'GOY point') + ' and counting — ' + _strong(goyLeader.name) + ' is out in front.',
                _strong(goyLeader.name) + ' is top of the GOY pile in this group (' + goyLeader.goyPts + ' pts).',
                'Bragging rights belong to ' + _strong(goyLeader.name) + ' for now — ' + _plural(goyLeader.goyPts, 'GOY point') + '.',
                _strong(goyLeader.name) + ' has been the headline-getter: ' + _plural(goyLeader.goyPts, 'GOY point') + ' from ' + _plural(goyLeader.goyCompCount, 'event') + '.'
            ];
            takeaways.push(_pick(variants, seed, 1));
        }
    } else if (rows.length > 1) {
        takeaways.push(_pick([
            'GOY column is empty for everyone here — somebody owes the group a top-20 finish.',
            'Nobody in this group has cracked the GOY board yet. Time to break the duck.',
            'No GOY points scored in this group. The next top 20 will draw first blood.'
        ], seed, 2));
    }

    // ----- 2. Gross eclectic -----
    if (grossLeader) {
        const others = withGross.filter(r => r !== grossLeader);
        const margin = others.length ? Math.min(...others.map(r => r.eclGross - grossLeader.eclGross)) : 0;
        const tied = withGross.filter(r => r.eclGross === grossLeader.eclGross);
        if (tied.length > 1) {
            const names = tied.map(r => _strong(r.name)).join(' & ');
            takeaways.push(_pick([
                'Tied on gross eclectic: ' + names + ' on ' + grossLeader.eclGross + ' — countback drama.',
                names + ' locked together on gross at ' + grossLeader.eclGross + '.',
                'Gross eclectic dead heat: ' + names + ' both on ' + grossLeader.eclGross + '.'
            ], seed, 3));
        } else if (margin > 0) {
            takeaways.push(_pick([
                'Eclectic <strong>gross</strong> leader: ' + _strong(grossLeader.name) + ' (' + grossLeader.eclGross + '), ' + _plural(margin, 'shot') + ' clear.',
                _strong(grossLeader.name) + ' holds the gross eclectic at ' + grossLeader.eclGross + ' — ' + _plural(margin, 'shot') + ' over the next-best.',
                'Gross honours: ' + _strong(grossLeader.name) + ' at ' + grossLeader.eclGross + ', ' + _plural(margin, 'shot') + ' ahead.',
                'On the gross front: ' + _strong(grossLeader.name) + ' leads at ' + grossLeader.eclGross + '.'
            ], seed, 3));
        } else {
            takeaways.push(_strong(grossLeader.name) + ' is the only one with a full eclectic gross card (' + grossLeader.eclGross + ').');
        }
    }

    // ----- 3. Nett eclectic -----
    if (nettLeader) {
        const others = withNet.filter(r => r !== nettLeader);
        const margin = others.length ? Math.min(...others.map(r => r.eclNet - nettLeader.eclNet)) : 0;
        const tied = withNet.filter(r => r.eclNet === nettLeader.eclNet);
        if (tied.length > 1) {
            // Sort by precomputed nettRank — full countback chain (back-9 → back-6 → back-3 → 18th)
            const ordered = [...tied].sort((a, b) => (a.nettRank ?? Infinity) - (b.nettRank ?? Infinity));
            const winner = ordered[0];
            takeaways.push(_pick([
                'Nett tied at ' + nettLeader.eclNet + ' between ' + tied.map(r => _strong(r.name)).join(' & ') + ' — ' + _strong(winner.name) + ' edges it on back-9 countback.',
                'Countback theatre on nett: ' + tied.map(r => _strong(r.name)).join(' & ') + ' locked on ' + nettLeader.eclNet + '. ' + _strong(winner.name) + ' wins the back 9.',
                tied.map(r => _strong(r.name)).join(' & ') + ' are level on nett (' + nettLeader.eclNet + '). Right now ' + _strong(winner.name) + ' has the better back 9.'
            ], seed, 4));
        } else if (margin > 0) {
            takeaways.push(_pick([
                'Eclectic <strong>nett</strong> leader: ' + _strong(nettLeader.name) + ' (' + nettLeader.eclNet + '), ' + _plural(margin, 'shot') + ' clear.',
                _strong(nettLeader.name) + ' takes the nett race at ' + nettLeader.eclNet + ' — ' + _plural(margin, 'shot') + ' ahead.',
                'Nett honours go to ' + _strong(nettLeader.name) + ' at ' + nettLeader.eclNet + '.',
                'On nett: ' + _strong(nettLeader.name) + ' leads with ' + nettLeader.eclNet + ' (' + _plural(margin, 'shot') + ' clear).'
            ], seed, 4));
        }
    }

    // ----- 4. HC dynamics -----
    const hcRows = rows.filter(r => r.handicap !== null && r.handicap !== undefined);
    if (hcRows.length >= 2) {
        const min = Math.min(...hcRows.map(r => r.handicap));
        const max = Math.max(...hcRows.map(r => r.handicap));
        const lowHC = hcRows.find(r => r.handicap === min);
        const highHC = hcRows.find(r => r.handicap === max);
        const spread = max - min;
        if (spread >= 5) {
            takeaways.push(_pick([
                'Handicap spread is ' + _plural(spread, 'shot') + ' — the lower handicappers need to keep the gross close to stay in the nett race.',
                _plural(spread, 'shot') + ' of handicap separate this group. Nett race could swing on any single round.',
                'Big handicap gap (' + spread + ' shots) — the cut will do plenty of work.'
            ], seed, 5));
        }
        // Lowest HC has the best gross — natural order
        if (grossLeader && grossLeader === lowHC && rows.length > 1) {
            takeaways.push(_pick([
                _strong(lowHC.name) + ' (HC ' + lowHC.handicap + ') leading on gross — the lowest handicapper is doing what they should.',
                'Natural order on the gross board: lowest HC (' + _strong(lowHC.name) + ', off ' + lowHC.handicap + ') out in front.'
            ], seed, 6));
        }
        // Highest HC has best nett — cut is working
        if (nettLeader && nettLeader === highHC && rows.length > 1 && highHC.handicap > lowHC.handicap) {
            takeaways.push(_pick([
                _strong(highHC.name) + ' (HC ' + highHC.handicap + ') wears the nett crown — handicaps doing their job.',
                'Highest handicapper ' + _strong(highHC.name) + ' is best on nett. The cut is working.',
                'The strokes are paying for ' + _strong(highHC.name) + ' — top of the nett pile off ' + highHC.handicap + '.'
            ], seed, 7));
        }
        // Lowest HC NOT on top of nett — punishment
        if (nettLeader && nettLeader !== lowHC && lowHC.eclNet !== null && nettLeader.eclNet !== null && rows.length > 1 && lowHC !== highHC) {
            const gap = lowHC.eclNet - nettLeader.eclNet;
            if (gap >= 4) {
                takeaways.push(_pick([
                    _strong(lowHC.name) + ' off ' + lowHC.handicap + ' is ' + _plural(gap, 'shot') + ' off the nett lead — gross isn\'t translating.',
                    'Low handicapper ' + _strong(lowHC.name) + ' giving away too many strokes — ' + _plural(gap, 'shot') + ' behind ' + _strong(nettLeader.name) + ' on nett.'
                ], seed, 8));
            }
        }
    }

    // ----- 5. Front 9 / Back 9 specialists -----
    if (withScores.length >= 2) {
        const front9Leader = withScores.reduce((b, r) => (!b || r._perf.front9 < b._perf.front9 ? r : b), null);
        const back9Leader  = withScores.reduce((b, r) => (!b || r._perf.back9  < b._perf.back9  ? r : b), null);
        if (front9Leader && back9Leader && front9Leader !== back9Leader) {
            takeaways.push(_pick([
                _strong(front9Leader.name) + ' owns the front 9 (' + front9Leader._perf.front9 + '); ' + _strong(back9Leader.name) + ' owns the back (' + back9Leader._perf.back9 + ').',
                'Two halves of the course, two different leaders — ' + _strong(front9Leader.name) + ' out in ' + front9Leader._perf.front9 + ', ' + _strong(back9Leader.name) + ' back in ' + back9Leader._perf.back9 + '.',
                'Front 9 ' + _strong(front9Leader.name) + ' (' + front9Leader._perf.front9 + '), back 9 ' + _strong(back9Leader.name) + ' (' + back9Leader._perf.back9 + ').'
            ], seed, 9));
        } else if (front9Leader && front9Leader === back9Leader) {
            takeaways.push(_pick([
                _strong(front9Leader.name) + ' leads both nines (' + front9Leader._perf.front9 + ' / ' + front9Leader._perf.back9 + ') — complete card.',
                'Clean sweep for ' + _strong(front9Leader.name) + ' on both nines.'
            ], seed, 9));
        }
    }

    // ----- 6. Par-3 specialist -----
    if (withScores.length >= 2) {
        const par3Leader = withScores.reduce((b, r) => (!b || r._perf.par3 < b._perf.par3 ? r : b), null);
        if (par3Leader) {
            const overPar = par3Leader._perf.par3 - par3Leader._perf.par3Par;
            const otherP3 = withScores.filter(r => r !== par3Leader);
            const margin = otherP3.length ? Math.min(...otherP3.map(r => r._perf.par3 - par3Leader._perf.par3)) : 0;
            if (margin >= 1) {
                takeaways.push(_pick([
                    _strong(par3Leader.name) + ' owns the par 3s (' + par3Leader._perf.par3 + ', ' + (overPar >= 0 ? '+' : '') + overPar + ' to par).',
                    'Par 3s are ' + _strong(par3Leader.name) + '\'s patch (' + par3Leader._perf.par3 + ' total).',
                    _strong(par3Leader.name) + ' has the short-game edge — ' + par3Leader._perf.par3 + ' across the par 3s.'
                ], seed, 10));
            }
        }
    }

    // ----- 7. Par-5 specialist -----
    if (withScores.length >= 2) {
        const par5Leader = withScores.reduce((b, r) => (!b || r._perf.par5 < b._perf.par5 ? r : b), null);
        if (par5Leader) {
            const otherP5 = withScores.filter(r => r !== par5Leader);
            const margin = otherP5.length ? Math.min(...otherP5.map(r => r._perf.par5 - par5Leader._perf.par5)) : 0;
            if (margin >= 1) {
                const overPar = par5Leader._perf.par5 - par5Leader._perf.par5Par;
                takeaways.push(_pick([
                    _strong(par5Leader.name) + ' is the par-5 king (' + par5Leader._perf.par5 + ', ' + (overPar >= 0 ? '+' : '') + overPar + ' to par).',
                    'Big-hitter award goes to ' + _strong(par5Leader.name) + ' — best on the par 5s.',
                    _strong(par5Leader.name) + ' eats par 5s for breakfast (' + par5Leader._perf.par5 + ' total).'
                ], seed, 11));
            }
        }
    }

    // ----- 8. Birdie king -----
    if (withScores.length >= 2) {
        const birdieKing = withScores.reduce((b, r) => (!b || r._perf.birdies > b._perf.birdies ? r : b), null);
        if (birdieKing && birdieKing._perf.birdies >= 2) {
            const others = withScores.filter(r => r !== birdieKing);
            if (others.every(r => r._perf.birdies < birdieKing._perf.birdies)) {
                takeaways.push(_pick([
                    _strong(birdieKing.name) + ' is the birdie machine — ' + _plural(birdieKing._perf.birdies, 'red number') + ' on the eclectic card.',
                    'Most birdies in the group: ' + _strong(birdieKing.name) + ' with ' + birdieKing._perf.birdies + '.',
                    _strong(birdieKing.name) + ' tops the birdie count (' + birdieKing._perf.birdies + ').'
                ], seed, 12));
            }
        }
    }

    // ----- 9. Eagles (rare — always mention) -----
    for (const r of withScores) {
        if (r._perf.eagles > 0) {
            takeaways.push(_pick([
                _strong(r.name) + ' has ' + _plural(r._perf.eagles, 'eagle') + ' on the eclectic card. 🦅',
                _plural(r._perf.eagles, 'eagle') + ' for ' + _strong(r.name) + ' — show-off.',
                'Eagle alert: ' + _strong(r.name) + ' has ' + _plural(r._perf.eagles, 'two-under') + ' on the card.'
            ], seed, 13 + r.name.charCodeAt(0)));
        }
    }

    // ----- 10. Clean card (low doubles-plus) -----
    if (withScores.length >= 2) {
        const cleanest = withScores.reduce((b, r) => (!b || r._perf.doublesPlus < b._perf.doublesPlus ? r : b), null);
        if (cleanest && cleanest._perf.doublesPlus <= 1) {
            const others = withScores.filter(r => r !== cleanest);
            if (others.every(r => r._perf.doublesPlus > cleanest._perf.doublesPlus)) {
                takeaways.push(_pick([
                    _strong(cleanest.name) + ' has the cleanest card — ' + (cleanest._perf.doublesPlus === 0 ? 'zero' : _plural(cleanest._perf.doublesPlus, 'hole')) + ' worse than bogey.',
                    'Consistency award: ' + _strong(cleanest.name) + ' — barely a blow-up hole on the eclectic.'
                ], seed, 14));
            }
        }
    }

    // ----- 11. Most active / least active -----
    const mostActive = rows.reduce((b, r) => (!b || r.rounds > b.rounds ? r : b), null);
    const leastActive = rows.reduce((b, r) => (!b || r.rounds < b.rounds ? r : b), null);
    if (mostActive && leastActive && mostActive !== leastActive && mostActive.rounds > 0 && rows.length > 1) {
        const others = rows.filter(r => r !== mostActive);
        if (others.every(r => r.rounds < mostActive.rounds)) {
            const totalOthers = others.reduce((s, r) => s + r.rounds, 0);
            if (mostActive.rounds >= totalOthers && rows.length >= 3) {
                takeaways.push(_pick([
                    _strong(mostActive.name) + ' has played as many rounds (' + mostActive.rounds + ') as the rest of the group combined.',
                    'Show-up factor: ' + _strong(mostActive.name) + ' has matched the rest of the group for rounds played.',
                    _strong(mostActive.name) + ' is the workhorse — ' + mostActive.rounds + ' rounds against ' + totalOthers + ' for the others.'
                ], seed, 15));
            } else {
                takeaways.push(_pick([
                    _strong(mostActive.name) + ' is the grinder — ' + _plural(mostActive.rounds, 'round') + ' counted.',
                    'Most rounds in the group: ' + _strong(mostActive.name) + ' (' + mostActive.rounds + ').',
                    _strong(mostActive.name) + ' is putting in the shifts — ' + _plural(mostActive.rounds, 'round') + ' so far.'
                ], seed, 15));
            }
        }
        if (leastActive.rounds === 0 && rows.length >= 2) {
            takeaways.push(_pick([
                _strong(leastActive.name) + ' hasn\'t logged a round yet. Card or be banter-fuel.',
                'No rounds counted for ' + _strong(leastActive.name) + ' — the others are out of sight on the eclectic for now.'
            ], seed, 16));
        }
    }

    // ----- 12. Group totals -----
    if (withGross.length >= 2 && withGross.length === rows.length) {
        const combined = withGross.reduce((s, r) => s + r.eclGross, 0);
        const avg = (combined / withGross.length).toFixed(1);
        const totalPar = COURSE.totalPar * withGross.length;
        const diff = combined - totalPar;
        takeaways.push(_pick([
            'Combined gross eclectic: ' + combined + ' (' + (diff >= 0 ? '+' : '') + diff + ' to par across ' + withGross.length + ' players).',
            'Group average eclectic gross: ' + avg + '.',
            'Between them this group has carded an eclectic gross of ' + combined + ' (avg ' + avg + ').'
        ], seed, 17));
    }

    // ----- 13. Hole tyrant (everybody worse than X) -----
    if (withScores.length >= 2) {
        for (let i = 0; i < 18; i++) {
            const par = COURSE.par[i];
            const scores = withScores.map(r => r.scores[i]).filter(s => s !== null && s !== undefined);
            if (scores.length === withScores.length) {
                // Group's collective worst hole — everyone N over par or worse
                const minOver = Math.min(...scores) - par;
                if (minOver >= 2 && withScores.length >= 3) {
                    takeaways.push(_pick([
                        'Hole ' + (i + 1) + ' (par ' + par + ') is the group\'s bogey — best score here is +' + minOver + '.',
                        'Nobody breaks par on hole ' + (i + 1) + ' — best in the group is +' + minOver + '.'
                    ], seed, 18 + i));
                    break;
                }
            }
        }
    }

    if (takeaways.length === 0) return '';

    // Cap at 6 lines so it's readable
    const final = takeaways.slice(0, 6);
    let block = '<div class="h2h-takeaways"><h4>🥊 Banter fuel</h4><ul>';
    for (const t of final) block += '<li>' + t + '</li>';
    block += '</ul></div>';
    return block;
}

// ============ EXPORT FUNCTIONS ============

function getTableTitle(type) {
    const year = appState.eclecticData ? appState.eclecticData.year : new Date().getFullYear();
    switch (type) {
        case 'goy': return 'Golfer of the Year ' + year;
        case 'eclectic-gross': return "Captain's Eclectic Cup (Gross) " + year;
        case 'eclectic-nett': return "Captain's Eclectic Cup (Nett) " + year;
        case 'eclectic-insights': return "Gross Eclectic Insights " + year;
        case 'eclectic-nett-insights': return "Nett Eclectic Insights " + year;
        case 'buddy-battle': return 'Buddy Battle ' + year;
    }
}

function getExportContainerId(type) {
    // Insights tabs use a different container suffix than the table tabs.
    if (type === 'eclectic-insights') return 'eclectic-insights-container';
    if (type === 'eclectic-nett-insights') return 'eclectic-nett-insights-container';
    return type + '-table-container';
}

function isInsightsExport(type) {
    return type === 'eclectic-insights' || type === 'eclectic-nett-insights';
}

// CSS injected into HTML / PDF exports for insights tabs so .insights-grid,
// .insight-card and friends render standalone (without the main site stylesheet).
function getInsightsExportCSS(forPrint) {
    const cardBreak = forPrint ? 'break-inside: avoid; page-break-inside: avoid;' : '';
    const printColor = forPrint ? ' -webkit-print-color-adjust: exact; print-color-adjust: exact;' : '';
    return [
        '.insights-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 1rem; margin-top: 0.5rem; }',
        '.insight-card { background: white; border: 1px solid #d0d0d0; border-radius: 6px; padding: 0.85rem 1rem; box-shadow: 0 1px 2px rgba(0,0,0,0.05); ' + cardBreak + ' }',
        '.insight-wide { grid-column: 1 / -1; }',
        '.insight-card h4 { margin: 0 0 0.6rem 0; color: #1a5e1a; font-size: 1rem; font-weight: 700; }',
        '.insight-stats { display: flex; flex-wrap: wrap; gap: 1rem; justify-content: center; }',
        '.stat-item { display: flex; flex-direction: column; align-items: center; min-width: 70px; }',
        '.stat-num { font-size: 1.5rem; font-weight: 700; color: #1a5e1a; }',
        '.stat-num .tie-note { font-weight: 400; color: #888; font-size: 0.6em; margin-left: 0.25em; font-style: italic; }',
        '.stat-label { font-size: 0.72rem; color: #888; text-align: center; }',
        '.insight-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }',
        '.insight-table th { background: #e8f0e8; color: #333; padding: 0.35rem 0.5rem; text-align: center; font-weight: 600; font-size: 0.72rem; border-bottom: 2px solid #c0d0c0;' + printColor + ' }',
        '.insight-table td { padding: 0.3rem 0.5rem; text-align: center; border-bottom: 1px solid #eee;' + printColor + ' }',
        '.insight-table td:first-child, .insight-table th:first-child { text-align: left; }',
        '.insight-table td:nth-child(2), .insight-table th:nth-child(2) { text-align: left; }',
        '.insight-subtitle { font-size: 0.78rem; color: #888; margin: -0.25rem 0 0.5rem 0; }',
        '.record-holder { font-size: 0.65rem; color: #555; }',
        '.par-row td, .par-row th { background: #f4f8f4; font-weight: 600;' + printColor + ' }'
    ].join('\n');
}

function exportHTML(type) {
    const container = document.getElementById(getExportContainerId(type));
    const tableHTML = container.innerHTML;
    const title = getTableTitle(type);
    const insights = isInsightsExport(type);

    const html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n' +
        '<title>' + title + ' - Blainroe Golf Club</title>\n' +
        '<style>\n' +
        'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 2rem; color: #1a2e1a; }\n' +
        'h1 { color: #1a5e1a; text-align: center; }\n' +
        'h2 { color: #333; text-align: center; font-weight: 400; margin-bottom: 1.5rem; }\n' +
        'table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin: 0 auto; }\n' +
        'thead { background: #1a5e1a; color: white; }\n' +
        'th { padding: 0.5rem 0.4rem; text-align: center; font-weight: 600; font-size: 0.8rem; }\n' +
        'td { padding: 0.4rem; text-align: center; border-bottom: 1px solid #ddd; }\n' +
        'td:nth-child(2) { text-align: left; }\n' +
        'tr:nth-child(even) { background: #f9f9f9; }\n' +
        '.total-cell { font-weight: 700; }\n' +
        '.par-row th { background: #e8f0e8; color: #555; font-weight: 600; }\n' +
        '.player-name { text-align: left; font-weight: 600; }\n' +
        '.eclectic-title-bar { text-align: center; font-size: 1.2rem; font-weight: 700; color: #1a5e1a; margin-bottom: 1rem; }\n' +
        '.comp-col-header { writing-mode: vertical-lr; text-orientation: mixed; transform: rotate(180deg); font-size: 0.7rem; }\n' +
        'footer { text-align: center; margin-top: 2rem; color: #888; font-size: 0.8rem; }\n' +
        (insights ? getInsightsExportCSS(false) + '\n' : '') +
        '</style>\n</head>\n<body>\n' +
        '<h1>\u26f3 Blainroe Golf Club</h1>\n' +
        '<h2>' + title + '</h2>\n' +
        tableHTML + '\n' +
        '<footer>Generated on ' + new Date().toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' }) + '</footer>\n' +
        '</body>\n</html>';

    downloadFile(html, type + '-' + new Date().getFullYear() + '.html', 'text/html');
}

function exportPDF(type) {
    const container = document.getElementById(getExportContainerId(type));
    const title = getTableTitle(type);
    const insights = isInsightsExport(type);
    const goyPdf = type === 'goy';
    const exportContent = goyPdf ? getGOYPdfExportContent(container) : container.innerHTML;
    const printWindow = window.open('', '_blank');
    printWindow.document.write('<!DOCTYPE html>\n<html>\n<head>\n<title>' + title + '</title>\n' +
        '<style>\n' +
        '@page { size: landscape; margin: 1cm; margin-top: 0.5cm; margin-bottom: 0.5cm; }\n' +
        (goyPdf ? '@page { size: A4 landscape; margin: 0.45cm; }\n' : '') +
        'body { font-family: Arial, sans-serif; margin: 1rem; color: #1a2e1a; }\n' +
        (goyPdf ? 'body { margin: 0; }\n' : '') +
        'h1 { font-size: 1.3rem; color: #1a5e1a; text-align: center; margin-bottom: 0.25rem; }\n' +
        'h2 { font-size: 1rem; color: #333; text-align: center; font-weight: 400; margin-bottom: 1rem; }\n' +
        'table { width: 100%; border-collapse: collapse; font-size: 0.75rem; }\n' +
        'thead { background: #1a5e1a; color: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }\n' +
        'th { padding: 6px 5px; text-align: center; font-weight: 800; font-size: 0.85rem; color: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }\n' +
        'td { padding: 3px; text-align: center; border-bottom: 1px solid #ddd; -webkit-print-color-adjust: exact; print-color-adjust: exact; }\n' +
        'td:nth-child(2) { text-align: left; }\n' +
        'tr:nth-child(even) { background: #f5f5f5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }\n' +
        '.total-cell { font-weight: 700; }\n' +
        '.par-row th { background: #e8f0e8; color: #555; -webkit-print-color-adjust: exact; print-color-adjust: exact; }\n' +
        '.player-name { text-align: left; font-weight: 600; }\n' +
        '.eclectic-title-bar { text-align: center; font-size: 1.1rem; font-weight: 700; color: #1a5e1a; margin-bottom: 0.75rem; }\n' +
        '.comp-col-header { writing-mode: vertical-lr; text-orientation: mixed; transform: rotate(180deg); font-size: 0.65rem; }\n' +
        (goyPdf ? getGOYPdfCSS() : '') +
        'footer { text-align: center; margin-top: 1rem; color: #888; font-size: 0.7rem; }\n' +
        (insights ? getInsightsExportCSS(true) + '\n' : '') +
        '</style>\n</head>\n<body>\n' +
        '<h1>\u26f3 Blainroe Golf Club</h1>\n' +
        '<h2>' + title + '</h2>\n' +
        exportContent + '\n' +
        '<footer>Generated on ' + new Date().toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' }) + '</footer>\n' +
        '<script>window.onload = function() { window.print(); }<\/script>\n' +
        '</body>\n</html>');
    printWindow.document.close();
}

function getGOYPdfCSS() {
    return [
        '#goy-table { table-layout: fixed; font-size: 6.6pt; line-height: 1.15; }',
        '#goy-table th, #goy-table td { padding: 2px 3px; border: 1px solid #d8d8d8; }',
        '#goy-table thead th { background: #1a5e1a; color: #fff; text-shadow: none; }',
        '#goy-table th:nth-child(1), #goy-table td:nth-child(1) { width: 24px; }',
        '#goy-table th:nth-child(2), #goy-table td:nth-child(2) { width: 32px; }',
        '#goy-table th:nth-child(3), #goy-table td:nth-child(3) { width: 30px; }',
        '#goy-table th:nth-child(4), #goy-table td:nth-child(4) { width: 112px; text-align: left; }',
        '#goy-table .comp-col { width: 24px; min-width: 24px; }',
        '#goy-table .comp-col-header { writing-mode: vertical-lr; text-orientation: mixed; transform: rotate(180deg); max-height: 72px; font-size: 5.4pt; padding: 2px 1px; line-height: 1.05; white-space: normal; }',
        '#goy-table .goy-pdf-event-number { font-weight: 800; font-size: 6pt; }',
        '#goy-table .goy-pdf-event-name { font-weight: 700; }',
        '#goy-table .goy-date-header { color: #fff; font-size: 6.2pt; font-weight: 700; }',
        '#goy-table .player-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
        '.goy-title-bar { font-size: 11pt; text-align: left; color: #1a5e1a; font-weight: 700; margin: 0 0 5px 0; }',
        '.goy-pdf-legend { margin-top: 8px; page-break-inside: avoid; break-inside: avoid; }',
        '.goy-pdf-legend h3 { margin: 0 0 4px 0; font-size: 8.5pt; color: #1a5e1a; }',
        '.goy-pdf-legend table { font-size: 6.8pt; width: 100%; table-layout: fixed; }',
        '.goy-pdf-legend th { background: #e8f0e8; color: #1a2e1a; padding: 3px; border: 1px solid #d0d8d0; }',
        '.goy-pdf-legend td { padding: 3px; border: 1px solid #e0e0e0; text-align: left; }',
        '.goy-pdf-legend td:first-child { text-align: center; font-weight: 700; color: #1a5e1a; width: 28px; }',
        '.goy-pdf-legend td:nth-child(2) { text-align: center; width: 42px; }'
    ].join('\n') + '\n';
}

function getGOYPdfExportContent(container) {
    const clone = container.cloneNode(true);
    const table = clone.querySelector('#goy-table');
    if (!table) return clone.innerHTML;

    const headerRows = table.querySelectorAll('thead tr');
    if (headerRows.length >= 3) {
        const eventCells = Array.from(headerRows[0].querySelectorAll('th')).slice(4);
        const dateCells = Array.from(headerRows[1].querySelectorAll('th')).slice(4);
        const nameCells = Array.from(headerRows[2].querySelectorAll('th')).slice(4);
        const events = nameCells.map((cell, index) => ({
            number: (eventCells[index] ? eventCells[index].textContent : String(index + 1)).trim(),
            date: (dateCells[index] ? dateCells[index].textContent : '').trim(),
            name: cell.textContent.trim()
        }));

        headerRows[0].remove();
        nameCells.forEach((cell, index) => {
            const header = cell.querySelector('.comp-col-header');
            const eventLabel = '<span class="goy-pdf-event-number">' + escapeHtml(events[index].number) + '</span> ' +
                '<span class="goy-pdf-event-name">' + escapeHtml(events[index].name) + '</span>';
            if (header) header.innerHTML = eventLabel;
            else cell.innerHTML = eventLabel;
            cell.title = events[index].name;
        });

        const legend = document.createElement('div');
        legend.className = 'goy-pdf-legend';
        legend.innerHTML = '<h3>Event key</h3>' + buildGOYPdfLegend(events);
        clone.appendChild(legend);
    }

    return clone.innerHTML;
}

function buildGOYPdfLegend(events) {
    let html = '<table><thead><tr><th>No.</th><th>Date</th><th>Competition</th><th>No.</th><th>Date</th><th>Competition</th><th>No.</th><th>Date</th><th>Competition</th></tr></thead><tbody>';
    for (let i = 0; i < events.length; i += 3) {
        html += '<tr>';
        for (let j = 0; j < 3; j++) {
            const event = events[i + j];
            if (event) {
                html += '<td>' + escapeHtml(event.number) + '</td><td>' + escapeHtml(event.date) + '</td><td>' + escapeHtml(event.name) + '</td>';
            } else {
                html += '<td></td><td></td><td></td>';
            }
        }
        html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ============ STORAGE ============

const STORAGE_KEY = 'blainroe_golf_app_data';

function saveToStorage() {
    try {
        const data = {
            version: 2,
            preloadedVersion: (typeof PRELOADED_DATA_VERSION !== 'undefined') ? PRELOADED_DATA_VERSION : 0,
            competitions: appState.competitions,
            eclecticData: appState.eclecticData,
            savedAt: new Date().toISOString()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('Could not save to localStorage:', e);
    }
}

function loadFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (data.version >= 1 && Array.isArray(data.competitions)) {
            appState.competitions = data.competitions;
            if (data.eclecticData) appState.eclecticData = data.eclecticData;
            for (const comp of appState.competitions) {
                comp.info.name = normalizeDisplayText(comp.info.name);
                comp.info.date = normalizeDisplayText(comp.info.date);
                comp.info.venue = normalizeDisplayText(comp.info.venue);
            }
            // Re-apply fixture matching to correct stale flags from old sessions
            if (typeof matchCompetitionToFixture === 'function') {
                for (const comp of appState.competitions) {
                    const fixtureMatch = matchCompetitionToFixture(comp.info.name, comp.info.date);
                    if (fixtureMatch) {
                        comp.config.isGOY = fixtureMatch.isGOY;
                        comp.config.isEclectic = (fixtureMatch.isEclectic !== undefined) ? !!fixtureMatch.isEclectic : true;
                        comp.config.isCaptains = fixtureMatch.isCaptains;
                        comp.fixtureMatch = fixtureMatch.fixture ? fixtureMatch.fixture.name : 'name-marker';
                    } else {
                        comp.config.isGOY = false;
                        // Preserve isEclectic if already set; otherwise leave undefined
                        // (calc treats undefined as "include" for back-compat).
                        comp.config.isCaptains = false;
                        comp.fixtureMatch = null;
                    }
                }
            }
            return appState.competitions.length > 0 || appState.eclecticData !== null;
        }
    } catch (e) {
        console.warn('Could not load from localStorage:', e);
    }
    return false;
}

// ============ FIXTURE TRACKER ============

function renderFixtureTracker() {
    const section = document.getElementById('fixture-tracker');
    const container = document.getElementById('fixture-tracker-content');
    if (!section || !container || typeof getFixtureCalendar !== 'function') return;

    const calendar = getFixtureCalendar(appState.competitions).filter(f => f.isGOY !== false);
    const yearBadge = document.getElementById('fixture-year-badge');
    if (yearBadge) yearBadge.textContent = GOY_FIXTURES.year;

    section.style.display = 'block';

    const uploaded = calendar.filter(f => f.uploadedForGOY).length;
    const total = calendar.length;

    let html = '<div class="fixture-progress">' +
        '<div class="fixture-progress-bar">' +
        '<div class="fixture-progress-fill" style="width:' + Math.round(uploaded / total * 100) + '%"></div>' +
        '</div>' +
        '<span class="fixture-progress-text">' + uploaded + ' of ' + total + ' competitions uploaded</span>' +
        '</div>';

    html += '<div class="fixture-grid">';
    for (const f of calendar) {
        const statusClass = f.uploadedForGOY ? 'fixture-done' : (f.isPast ? 'fixture-missed' : (f.isCurrent ? 'fixture-current' : 'fixture-upcoming'));
        const icon = f.uploadedForGOY ? '✅' : (f.isPast ? '⚠️' : (f.isCurrent ? '🔵' : '⬜'));
        const goyBadge = ' <span class="goy-badge" title="Counts towards Golfer of the Year">GOY</span>';
        const captainBadge = f.isCaptains ? ' <span class="captain-badge" title="Double GOY points">×2</span>' : '';
        const displayName = (f.name || '').replace(/\s*\(GOY\)\s*/gi, '').trim();
        const dateStr = f.dates.map(d => {
            const dt = new Date(d);
            return dt.getDate() + '/' + (dt.getMonth() + 1);
        }).join(', ');

        html += '<div class="fixture-card ' + statusClass + '">' +
            '<span class="fixture-icon">' + icon + '</span>' +
            '<div class="fixture-detail">' +
            '<span class="fixture-name">' + displayName + goyBadge + captainBadge + '</span>' +
            '<span class="fixture-date">' + dateStr + '</span>' +
            '</div>' +
            '</div>';
    }
    html += '</div>';

    container.innerHTML = html;
}

function renderEclecticTracker() {
    const section = document.getElementById('eclectic-tracker');
    const container = document.getElementById('eclectic-tracker-content');
    if (!section || !container || typeof getFixtureCalendar !== 'function') return;

    // Only Eclectic-eligible fixtures (isEclectic !== false). Defaults to included
    // for back-compat with any fixture entry that pre-dates the isEclectic flag.
    const calendar = getFixtureCalendar(appState.competitions).filter(f => f.isEclectic !== false);
    const yearBadge = document.getElementById('eclectic-year-badge');
    if (yearBadge) yearBadge.textContent = GOY_FIXTURES.year;

    section.style.display = 'block';

    const uploaded = calendar.filter(f => f.uploadedForEclectic).length;
    const total = calendar.length;

    let html = '<div class="fixture-progress">' +
        '<div class="fixture-progress-bar">' +
        '<div class="fixture-progress-fill" style="width:' + Math.round(uploaded / total * 100) + '%"></div>' +
        '</div>' +
        '<span class="fixture-progress-text">' + uploaded + ' of ' + total + ' competitions uploaded</span>' +
        '</div>';

    html += '<div class="fixture-grid">';
    for (const f of calendar) {
        const statusClass = f.uploadedForEclectic ? 'fixture-done' : (f.isPast ? 'fixture-missed' : (f.isCurrent ? 'fixture-current' : 'fixture-upcoming'));
        const icon = f.uploadedForEclectic ? '✅' : (f.isPast ? '⚠️' : (f.isCurrent ? '🔵' : '⬜'));
        const goyBadge = (f.isGOY === false) ? '' : ' <span class="goy-badge" title="Also counts towards Golfer of the Year">GOY</span>';
        const displayName = (f.name || '').replace(/\s*\(GOY\)\s*/gi, '').trim();
        const dateStr = f.dates.map(d => {
            const dt = new Date(d);
            return dt.getDate() + '/' + (dt.getMonth() + 1);
        }).join(', ');

        html += '<div class="fixture-card ' + statusClass + '">' +
            '<span class="fixture-icon">' + icon + '</span>' +
            '<div class="fixture-detail">' +
            '<span class="fixture-name">' + displayName + goyBadge + '</span>' +
            '<span class="fixture-date">' + dateStr + '</span>' +
            '</div>' +
            '</div>';
    }
    html += '</div>';

    container.innerHTML = html;
}

// ============ INITIALIZATION ============

document.addEventListener('DOMContentLoaded', () => {
    initUI();
    loadPalsFromStorage();
    initPalsSearch();
    // Check if preloaded data has been updated since last save
    const hasPreloaded = typeof PRELOADED_CSV_FILES !== 'undefined' && PRELOADED_CSV_FILES.length > 0;
    const currentPreloadedVersion = (typeof PRELOADED_DATA_VERSION !== 'undefined') ? PRELOADED_DATA_VERSION : 0;
    let storedPreloadedVersion = 0;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            storedPreloadedVersion = data.preloadedVersion || 0;
        }
    } catch (e) { /* ignore */ }
    const preloadedDataChanged = hasPreloaded && currentPreloadedVersion > storedPreloadedVersion;
    if (preloadedDataChanged) {
        // Clear stale localStorage when preloaded data has been updated
        localStorage.removeItem(STORAGE_KEY);
    }
    if (!preloadedDataChanged && loadFromStorage()) {
        renderCompetitionsTable();
        generateTables();
    } else if (hasPreloaded) {
        // Auto-load baked-in data when no localStorage data exists or data was refreshed
        for (const file of PRELOADED_CSV_FILES) {
            processUploadedFile(file.content, file.filename);
        }
        renderCompetitionsTable();
        generateTables();
        saveToStorage();
    }
    renderFixtureTracker();
    renderEclecticTracker();
});
