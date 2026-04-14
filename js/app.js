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
    eclecticData: null
};

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
    return { name, date, venue };
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
            const stablefordMatch = val.match(/(\d+)\s*(?:pts)?\s*\((\d+)\)/);
            if (stablefordMatch) {
                score = parseInt(stablefordMatch[1], 10);
                playingHandicap = parseInt(stablefordMatch[2], 10);
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
    if (!dateStr) return null;
    const months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
                     january:1,february:2,march:3,april:4,june:6,july:7,august:8,september:9,october:10,november:11,december:12 };
    const match = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
    if (match) {
        const m = months[match[2].toLowerCase()];
        if (m) return match[3] + '-' + String(m).padStart(2,'0') + '-' + match[1].padStart(2,'0');
    }
    return null;
}

function findMatchingCompetition(info, scorecards, playerNames) {
    const dateKey = extractDateKey(info.date);
    for (const comp of appState.competitions) {
        const compDateKey = extractDateKey(comp.info.date);
        if (dateKey && compDateKey && dateKey === compDateKey) return comp;
        if (info.date && comp.info.date) {
            if (comp.info.date.includes(info.date) || info.date.includes(comp.info.date)) return comp;
        }
    }
    if (scorecards || playerNames) {
        const names = playerNames || new Set(Object.keys(scorecards));
        for (const comp of appState.competitions) {
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
        const existing = findMatchingCompetition(parsed.info, parsed.scorecards);
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
        const existing = findMatchingCompetition(parsed.info, null, existingNames);
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
                    existing.config.isCaptains = fixtureMatch.isCaptains;
                    existing.fixtureMatch = fixtureMatch.fixture ? fixtureMatch.fixture.name : 'name-marker';
                } else {
                    existing.config.isGOY = false;
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
        // Auto-detect GOY and Captain's from fixture list
        const fixtureMatch = (typeof matchCompetitionToFixture === 'function')
            ? matchCompetitionToFixture(parsed.info.name, parsed.info.date)
            : null;
        if (fixtureMatch) {
            comp.config.isGOY = fixtureMatch.isGOY;
            comp.config.isCaptains = fixtureMatch.isCaptains;
            comp.fixtureMatch = fixtureMatch.fixture ? fixtureMatch.fixture.name : 'name-marker';
        } else {
            // Fallback: if no fixture match, don't assume GOY
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
    const compsWithCards = appState.competitions.filter(c => c.hasScorecard);
    if (compsWithCards.length === 0) return null;

    // Collect latest handicap per player (from most recent competition)
    // Sort competitions by date so we pick the latest handicap
    const sortedComps = [...appState.competitions].sort((a, b) => {
        const da = extractDateKey(a.info.date) || '';
        const db = extractDateKey(b.info.date) || '';
        return da.localeCompare(db);
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

        players.push({
            name,
            position: 0,
            rounds: data.rounds,
            scores,
            gross,
            handicap,
            handicapDisplay: String(handicap),
            net,
            countback: ''
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
    const allFixtures = (typeof GOY_FIXTURES !== 'undefined') ? GOY_FIXTURES.competitions : [];
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
    if (leader) html += ' — Current Leader: ' + escapeHtml(leader);
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

    // Sort by gross ascending (null gross goes to end)
    const players = [...data.players].sort((a, b) => {
        if (a.gross === null && b.gross === null) return 0;
        if (a.gross === null) return 1;
        if (b.gross === null) return -1;
        return a.gross - b.gross;
    });

    // Find the winner
    const winner = players.length > 0 && players[0].gross !== null ? players[0].name : '';
    const year = data.year || new Date().getFullYear();

    let html = '<div class="eclectic-title-bar">Captain\'s Eclectic Cup (Gross) ' + year + ' — Current Standings</div>';

    html += '<table class="eclectic-table"><thead>';

    // Par row
    html += '<tr class="par-row"><th></th><th></th><th></th>';
    for (let h = 0; h < 18; h++) {
        html += '<th>' + COURSE.par[h] + '</th>';
    }
    html += '<th></th></tr>';

    // Hole numbers row
    html += '<tr><th>Overall</th><th>Name</th><th class="rnds-col">Rounds</th>';
    for (let h = 1; h <= 18; h++) {
        html += '<th>' + h + '</th>';
    }
    html += '<th class="total-col">Gross</th></tr>';
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

    for (const p of players) {
        const rankClass = p.grossPos <= 3 ? ' class="rank-' + p.grossPos + '"' : '';
        html += '<tr' + rankClass + '>';
        html += '<td>' + p.grossPos + '</td>';
        html += '<td class="player-name">' + escapeHtml(displayName(p.name)) + '</td>';
        html += '<td class="rnds-col">' + p.rounds + '</td>';

        for (let h = 0; h < 18; h++) {
            const s = p.scores[h];
            if (s === null) {
                html += '<td>-</td>';
            } else {
                const diff = s - COURSE.par[h];
                const style = getScoreCellStyle(diff);
                html += '<td' + (style ? ' style="' + style + '"' : '') + '>' + s + '</td>';
            }
        }

        html += '<td class="total-cell">' + (p.gross !== null ? p.gross : 'NR') + '</td>';
        html += '</tr>';
    }

    html += '</tbody></table>';
    return html;
}

function renderEclecticNettTable(data) {
    if (!data || !data.players || data.players.length === 0) {
        return '<p class="status-msg info">No Eclectic data. Upload an Eclectic CSV from Handicap Master.</p>';
    }

    // Sort by net ascending (null net goes to end)
    const players = [...data.players].sort((a, b) => {
        if (a.net === null && b.net === null) return 0;
        if (a.net === null) return 1;
        if (b.net === null) return -1;
        if (a.net !== b.net) return a.net - b.net;
        return 0;
    });

    const winner = players.length > 0 && players[0].net !== null ? players[0].name : '';
    const year = data.year || new Date().getFullYear();

    let html = '<div class="eclectic-title-bar">Captain\'s Eclectic Cup (Nett) ' + year + ' — Current Standings</div>';

    html += '<table class="eclectic-table"><thead>';

    // Par row
    html += '<tr class="par-row"><th></th><th></th><th></th>';
    for (let h = 0; h < 18; h++) {
        html += '<th>' + COURSE.par[h] + '</th>';
    }
    html += '<th></th><th></th><th></th></tr>';

    // Hole numbers + column headers
    html += '<tr><th>Overall</th><th>Name</th><th class="rnds-col">Rounds</th>';
    for (let h = 1; h <= 18; h++) {
        html += '<th>' + h + '</th>';
    }
    html += '<th class="total-col">Gross</th><th>H\'cap</th><th class="total-col">Net</th></tr>';
    html += '</thead><tbody>';

    // Positions are from the original CSV sort (by net)
    for (const p of players) {
        const rankClass = p.position <= 3 ? ' class="rank-' + p.position + '"' : '';
        html += '<tr' + rankClass + '>';
        html += '<td>' + p.position + '</td>';
        html += '<td class="player-name">' + escapeHtml(displayName(p.name)) + '</td>';
        html += '<td class="rnds-col">' + p.rounds + '</td>';

        for (let h = 0; h < 18; h++) {
            const s = p.scores[h];
            if (s === null) {
                html += '<td>-</td>';
            } else {
                // Color based on gross score vs par (same as gross table)
                const diff = s - COURSE.par[h];
                const style = getScoreCellStyle(diff);
                html += '<td' + (style ? ' style="' + style + '"' : '') + '>' + s + '</td>';
            }
        }

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
    const completePlayers = players.filter(p => p.gross !== null).sort((a, b) => a.gross - b.gross);
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
    html += '<div class="stat-item"><span class="stat-num">' + totalEagles + '</span><span class="stat-label">🟡 Eagles</span></div>';
    html += '<div class="stat-item"><span class="stat-num">' + totalBirdies + '</span><span class="stat-label">🔴 Birdies</span></div>';
    html += '<div class="stat-item"><span class="stat-num">' + totalPars + '</span><span class="stat-label">🟢 Pars</span></div>';
    if (completePlayers.length > 0) {
        html += '<div class="stat-item"><span class="stat-num">' + completePlayers[0].gross + '</span><span class="stat-label">Best Gross</span></div>';
    }
    html += '</div></div>';

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
        html += '<td><strong>' + p.birdies + '</strong></td>';
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
        html += '<td><strong>' + p.pars + '</strong></td>';
        html += '<td>' + pct + '%</td></tr>';
    }
    html += '</tbody></table></div>';

    // Eagles club
    if (eaglePlayers.length > 0) {
        html += '<div class="insight-card">';
        html += '<h4>🦅 Eagle Club</h4>';
        html += '<table class="insight-table"><thead><tr><th>Player</th><th>Eagles</th></tr></thead><tbody>';
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
    const byNett = [...nettPlayers].sort((a, b) => a.net - b.net);

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

    // ---- BUILD HTML ----
    let html = '<div class="insights-grid">';

    // Overview
    html += '<div class="insight-card insight-wide">';
    html += '<h4>📊 Nett Season Overview</h4>';
    html += '<div class="insight-stats">';
    html += '<div class="stat-item"><span class="stat-num">' + nettPlayers.length + '</span><span class="stat-label">Full Nett Cards</span></div>';
    html += '<div class="stat-item"><span class="stat-num">' + byNett[0].net + '</span><span class="stat-label">Best Nett</span></div>';
    html += '<div class="stat-item"><span class="stat-num">' + escapeHtml(displayName(byNett[0].name)) + '</span><span class="stat-label">Nett Leader</span></div>';
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

    for (const comp of appState.competitions) {
        const playerCount = comp.hasScorecard
            ? Object.keys(comp.scorecards).length
            : comp.results.length;
        const typeLabel = [];
        if (comp.hasReport) typeLabel.push('Report');
        if (comp.hasScorecard) typeLabel.push('Scorecards');
        // Show auto-detect badge
        const autoTag = comp.fixtureMatch
            ? ' <span class="auto-badge" title="Auto-detected from fixture list: ' + escapeHtml(comp.fixtureMatch) + '">AUTO</span>'
            : '';

        const tr = document.createElement('tr');
        tr.innerHTML =
            '<td style="text-align:left">' + escapeHtml(comp.info.name || comp.filename) + autoTag + '</td>' +
            '<td>' + escapeHtml(comp.info.date || '-') + '</td>' +
            '<td>' + playerCount + '</td>' +
            '<td>' + typeLabel.join(' + ') + '</td>' +
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
    appState.competitions = appState.competitions.filter(c => c.id !== compId);
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
}

// ============ EXPORT FUNCTIONS ============

function getTableTitle(type) {
    const year = appState.eclecticData ? appState.eclecticData.year : new Date().getFullYear();
    switch (type) {
        case 'goy': return 'Golfer of the Year ' + year;
        case 'eclectic-gross': return "Captain's Eclectic Cup (Gross) " + year;
        case 'eclectic-nett': return "Captain's Eclectic Cup (Nett) " + year;
    }
}

function exportHTML(type) {
    const container = document.getElementById(type + '-table-container');
    const tableHTML = container.innerHTML;
    const title = getTableTitle(type);

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
        '</style>\n</head>\n<body>\n' +
        '<h1>\u26f3 Blainroe Golf Club</h1>\n' +
        '<h2>' + title + '</h2>\n' +
        tableHTML + '\n' +
        '<footer>Generated on ' + new Date().toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' }) + '</footer>\n' +
        '</body>\n</html>';

    downloadFile(html, type + '-' + new Date().getFullYear() + '.html', 'text/html');
}

function exportPDF(type) {
    const container = document.getElementById(type + '-table-container');
    const title = getTableTitle(type);
    const printWindow = window.open('', '_blank');
    printWindow.document.write('<!DOCTYPE html>\n<html>\n<head>\n<title>' + title + '</title>\n' +
        '<style>\n' +
        '@page { size: landscape; margin: 1cm; }\n' +
        'body { font-family: Arial, sans-serif; margin: 1rem; color: #1a2e1a; }\n' +
        'h1 { font-size: 1.3rem; color: #1a5e1a; text-align: center; margin-bottom: 0.25rem; }\n' +
        'h2 { font-size: 1rem; color: #333; text-align: center; font-weight: 400; margin-bottom: 1rem; }\n' +
        'table { width: 100%; border-collapse: collapse; font-size: 0.75rem; }\n' +
        'thead { background: #1a5e1a; color: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }\n' +
        'th { padding: 4px 3px; text-align: center; font-weight: 600; font-size: 0.7rem; }\n' +
        'td { padding: 3px; text-align: center; border-bottom: 1px solid #ddd; -webkit-print-color-adjust: exact; print-color-adjust: exact; }\n' +
        'td:nth-child(2) { text-align: left; }\n' +
        'tr:nth-child(even) { background: #f5f5f5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }\n' +
        '.total-cell { font-weight: 700; }\n' +
        '.par-row th { background: #e8f0e8; color: #555; -webkit-print-color-adjust: exact; print-color-adjust: exact; }\n' +
        '.player-name { text-align: left; font-weight: 600; }\n' +
        '.eclectic-title-bar { text-align: center; font-size: 1.1rem; font-weight: 700; color: #1a5e1a; margin-bottom: 0.75rem; }\n' +
        '.comp-col-header { writing-mode: vertical-lr; text-orientation: mixed; transform: rotate(180deg); font-size: 0.65rem; }\n' +
        'footer { text-align: center; margin-top: 1rem; color: #888; font-size: 0.7rem; }\n' +
        '</style>\n</head>\n<body>\n' +
        '<h1>\u26f3 Blainroe Golf Club</h1>\n' +
        '<h2>' + title + '</h2>\n' +
        container.innerHTML + '\n' +
        '<footer>Generated on ' + new Date().toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' }) + '</footer>\n' +
        '<script>window.onload = function() { window.print(); }<\/script>\n' +
        '</body>\n</html>');
    printWindow.document.close();
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
            // Re-apply fixture matching to correct stale flags from old sessions
            if (typeof matchCompetitionToFixture === 'function') {
                for (const comp of appState.competitions) {
                    const fixtureMatch = matchCompetitionToFixture(comp.info.name, comp.info.date);
                    if (fixtureMatch) {
                        comp.config.isGOY = fixtureMatch.isGOY;
                        comp.config.isCaptains = fixtureMatch.isCaptains;
                        comp.fixtureMatch = fixtureMatch.fixture ? fixtureMatch.fixture.name : 'name-marker';
                    } else {
                        comp.config.isGOY = false;
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

    const calendar = getFixtureCalendar(appState.competitions);
    const yearBadge = document.getElementById('fixture-year-badge');
    if (yearBadge) yearBadge.textContent = GOY_FIXTURES.year;

    section.style.display = 'block';

    const uploaded = calendar.filter(f => f.uploaded).length;
    const total = calendar.length;

    let html = '<div class="fixture-progress">' +
        '<div class="fixture-progress-bar">' +
        '<div class="fixture-progress-fill" style="width:' + Math.round(uploaded / total * 100) + '%"></div>' +
        '</div>' +
        '<span class="fixture-progress-text">' + uploaded + ' of ' + total + ' competitions uploaded</span>' +
        '</div>';

    html += '<div class="fixture-grid">';
    for (const f of calendar) {
        const statusClass = f.uploaded ? 'fixture-done' : (f.isPast ? 'fixture-missed' : (f.isCurrent ? 'fixture-current' : 'fixture-upcoming'));
        const icon = f.uploaded ? '✅' : (f.isPast ? '⚠️' : (f.isCurrent ? '🔵' : '⬜'));
        const captainBadge = f.isCaptains ? ' <span class="captain-badge">×2</span>' : '';
        const dateStr = f.dates.map(d => {
            const dt = new Date(d);
            return dt.getDate() + '/' + (dt.getMonth() + 1);
        }).join(', ');

        html += '<div class="fixture-card ' + statusClass + '">' +
            '<span class="fixture-icon">' + icon + '</span>' +
            '<div class="fixture-detail">' +
            '<span class="fixture-name">' + f.name + captainBadge + '</span>' +
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
    if (loadFromStorage()) {
        renderCompetitionsTable();
        generateTables();
    }
    renderFixtureTracker();
});
