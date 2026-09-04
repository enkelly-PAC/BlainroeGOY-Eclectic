// ============================================================
// Blainroe Golf Club - 2026 GOY Fixture Configuration
// ============================================================
// Update this file each year with the new fixture list.
// The app uses this to auto-detect GOY and Captain's Prize
// competitions when CSV files are uploaded.
// ============================================================

const GOY_FIXTURES = {
    year: 2026,

    // Captain's Eclectic Cup official start date (ISO, inclusive).
    // Competitions dated BEFORE this are excluded from Eclectic calculations
    // even if their scorecards happen to be uploaded.
    eclecticStartDate: "2026-04-04",

    // All GOY-qualifying competitions for the year.
    // Each entry: { name, keywords, dates (ISO), isCaptains, category }
    // 'keywords' are lowercase fragments matched against CSV competition names.
    // 'dates' are the Sat/Sun (or multi-day) dates for the competition.
    competitions: [
        {
            name: "Men's March Medal (GOY)",
            keywords: ["march medal"],
            dates: ["2026-04-04", "2026-04-05"],
            isGOY: true,
            isEclectic: true,
            isCaptains: false,
            category: "Medal"
        },
        {
            name: "Men's Singles Stableford (April)",
            keywords: ["singles stableford - 11", "singles stableford - 12"],
            dates: ["2026-04-11", "2026-04-12"],
            isGOY: false,
            isEclectic: true,
            isCaptains: false,
            category: "Singles Stableford"
        },
        {
            name: "Men's April Medal",
            keywords: ["april medal"],
            dates: ["2026-04-18", "2026-04-19"],
            isGOY: true,
            isEclectic: true,
            isCaptains: false,
            category: "Medal"
        },
        {
            name: "Peter Roper Cup (GOY)",
            keywords: ["peter roper"],
            dates: ["2026-04-25", "2026-04-26"],
            isGOY: true,
            isEclectic: true,
            isCaptains: false,
            category: "GOY Trophy"
        },
        {
            name: "Men's May Medal",
            keywords: ["may medal"],
            dates: ["2026-05-02", "2026-05-03"],
            isGOY: true,
            isEclectic: true,
            isCaptains: false,
            category: "Medal"
        },
        {
            name: "McCrea Cup (GOY)",
            keywords: ["mccrea"],
            dates: ["2026-05-09", "2026-05-10"],
            isGOY: true,
            isEclectic: true,
            isCaptains: false,
            category: "GOY Trophy"
        },
        {
            name: "Mens Scratch Cups and Singles Stableford",
            keywords: ["scratch cups and singles stableford"],
            dates: ["2026-05-16", "2026-05-17"],
            isGOY: false,
            isEclectic: true,
            isCaptains: false,
            category: "Scratch Cups"
        },
        {
            name: "Lady Captain's Prize to Men (GOY)",
            keywords: ["lady captain", "lady capt", "hilary flynn"],
            dates: ["2026-05-23", "2026-05-24"],
            isGOY: true,
            isEclectic: true,
            isCaptains: false,
            category: "GOY Trophy"
        },
        {
            name: "President's Prize to Men",
            keywords: ["president's prize to men", "presidents prize to men", "men's presidents prize", "men's president's prize"],
            dates: ["2026-05-30"],
            isGOY: true,
            isEclectic: true,
            isCaptains: false,
            category: "President's Prize"
        },
        {
            name: "Men's Singles Stableford (May)",
            keywords: ["singles stableford - 31 may"],
            dates: ["2026-05-31"],
            isGOY: false,
            isEclectic: true,
            isCaptains: false,
            category: "Singles Stableford"
        },
        {
            name: "Men's June Medal",
            keywords: ["june medal"],
            dates: ["2026-06-06", "2026-06-07"],
            isGOY: true,
            isEclectic: true,
            isCaptains: false,
            category: "Medal"
        },
        {
            name: "WH Scott Trophy (GOY)",
            keywords: ["wh scott", "w.h. scott", "w h scott"],
            dates: ["2026-06-13", "2026-06-14"],
            isGOY: true,
            isEclectic: true,
            isCaptains: false,
            category: "GOY Trophy"
        },
        {
            name: "Men's Singles Stableford (21 June)",
            // Keyword is deliberately a phrase that never appears in the real
            // "Men's Singles Stableford" export name (same convention as the
            // 31 May entry above). These standalone Sunday-only rounds share
            // an identical generic competition name every time, so the date
            // is the only reliable identity signal; matchCompetitionToFixture
            // resolves this via its date-only pass, never via keyword.
            keywords: ["singles stableford - 21 june"],
            dates: ["2026-06-21"],
            isGOY: false,
            isEclectic: true,
            isCaptains: false,
            identityByDateOnly: true,
            category: "Singles Stableford"
        },
        {
            name: "Lady President's Prize to Men (GOY)",
            keywords: ["lady president"],
            dates: ["2026-06-27", "2026-06-28"],
            isGOY: true,
            isEclectic: true,
            isCaptains: false,
            category: "GOY Trophy"
        },
        {
            name: "Men's Singles Stableford (5 July)",
            keywords: ["singles stableford - 05 july"],
            dates: ["2026-07-05"],
            isGOY: false,
            isEclectic: true,
            isCaptains: false,
            identityByDateOnly: true,
            category: "Singles Stableford"
        },
        {
            name: "Men's July Medal",
            keywords: ["july medal"],
            dates: ["2026-07-11", "2026-07-12"],
            isGOY: true,
            isEclectic: true,
            isCaptains: false,
            category: "Medal"
        },
        {
            name: "Captain's Prize Qualifier",
            keywords: ["captains qualifier", "captain's qualifier", "qualifier day", "gary kennedy qualifier"],
            dates: ["2026-07-18", "2026-07-19"],
            isGOY: false,
            isEclectic: true,
            isCaptains: false,
            category: "Captain's Prize"
        },
        {
            // Same calendar date as the Captain's Prize Final below (26 July).
            // Must be listed BEFORE the Final in this array: matchCompetitionToFixture
            // resolves keyword matches first (which always finds the Final correctly
            // via its own "captain's prize" keywords, regardless of array order), then
            // falls back to a date-only pass for names with no keyword hit at all (this
            // fixture's own scorecards, whose generic "Men's Singles Stableford" name
            // never matches any keyword). In that date-only pass the first fixture in
            // array order whose dates include the parsed date wins, so this entry must
            // precede "Captain's Prize Final (GOY)" or its own standalone Sunday round
            // would be misclassified as the Captain's Prize (GOY, double points).
            name: "Men's Singles Stableford (26 July, post-Captains)",
            keywords: ["singles stableford - 26 july (post captains)"],
            dates: ["2026-07-26"],
            isGOY: false,
            isEclectic: true,
            isCaptains: false,
            identityByDateOnly: true,
            category: "Singles Stableford"
        },
        {
            name: "Captain's Prize Final (GOY)",
            keywords: ["captains prize", "captain's prize", "captain's prize to men", "gary kennedy"],
            dates: ["2026-07-26"],
            isGOY: true,
            isEclectic: false,
            isCaptains: true,
            category: "Captain's Prize"
        },
        {
            name: "Men's August Medal",
            keywords: ["august medal"],
            dates: ["2026-08-08", "2026-08-09"],
            isGOY: true,
            isEclectic: true,
            isCaptains: false,
            category: "Medal"
        },
        {
            name: "Men's Singles Stableford (August)",
            // NOTE: the bare "singles stableford" keyword was removed (was
            // present here previously). Every standalone Sunday round shares
            // the exact same generic "Men's Singles Stableford" export name,
            // so a bare keyword match here would hijack ALL other Singles
            // Stableford fixtures below (21 June, 5 July, 26 July, 23 August,
            // 29/30 August) in the keyword pass, before their own (correct)
            // date-only match ever gets a chance to run. Rely on the
            // date-only pass instead, same convention as the other
            // standalone Sunday fixtures.
            keywords: ["1st august", "2nd august"],
            dates: ["2026-08-01", "2026-08-02"],
            isGOY: false,
            isEclectic: true,
            isCaptains: false,
            category: "Singles Stableford"
        },
        {
            name: "Professional's Prize & PGA Tankard (GOY)",
            keywords: ["professional", "pga tankard"],
            dates: ["2026-08-15", "2026-08-16"],
            isGOY: true,
            isEclectic: true,
            isCaptains: false,
            category: "GOY Trophy"
        },
        {
            name: "Men's Singles Stableford (23 August)",
            keywords: ["singles stableford - 23 august"],
            dates: ["2026-08-23"],
            isGOY: false,
            isEclectic: true,
            isCaptains: false,
            identityByDateOnly: true,
            category: "Singles Stableford"
        },
        {
            // Terminal 2026 competition for Nett handicap chronology. Spans an
            // alt-day Saturday round and the main Sunday round, same pattern
            // as the two-day medals above. The aggregate report's own "line 2"
            // name field is a mislabelled export artefact ("Captain Hilary's
            // Prize Back 9 Holes") that shares no keyword tokens with either
            // round's scorecard name ("Men's Singles Stableford"/"... - Alt
            // Day"), so this fixture (like its siblings above) is matched by
            // date only, never by keyword. The bare "singles stableford"
            // keyword previously used here was removed for the same reason
            // as the August 1-2 fixture above (it would hijack every other
            // Singles Stableford date in the keyword pass). identityByDateOnly
            // additionally lets the app.js merge logic (sameFixtureIdentity)
            // fold the mismatched-name report together with its scorecards
            // into one logical competition instead of three separate rows.
            name: "Men's Singles Stableford (29 and 30 August)",
            keywords: ["singles stableford whites - 30 august"],
            dates: ["2026-08-29", "2026-08-30"],
            isGOY: false,
            isEclectic: true,
            isCaptains: false,
            identityByDateOnly: true,
            category: "Singles Stableford"
        },
        {
            name: "Men's September Medal",
            keywords: ["september medal"],
            dates: ["2026-09-05", "2026-09-06"],
            isGOY: true,
            isEclectic: true,
            isCaptains: false,
            category: "Medal"
        },
        {
            name: "C.G. Cooney Trophy (GOY)",
            keywords: ["cooney"],
            dates: ["2026-09-12", "2026-09-13"],
            isGOY: true,
            isEclectic: true,
            isCaptains: false,
            category: "GOY Trophy"
        },
        {
            name: "Men's October Medal",
            keywords: ["october medal"],
            dates: ["2026-09-26", "2026-09-27"],
            isGOY: true,
            isEclectic: true,
            isCaptains: false,
            category: "Medal"
        }
    ]
};

// ============ FIXTURE MATCHING ENGINE ============

/**
 * Match an uploaded competition against the GOY fixture list.
 * Uses keyword matching on competition name and date matching.
 * Returns: { isGOY, isCaptains, fixture } or null if no match.
 */
// Build the { isGOY, isEclectic, isCaptains, fixture } result shape for a
// matched fixture, honouring its explicit isGOY / isEclectic flags (default
// isGOY=true for back-compat; default isEclectic mirrors isGOY).
function buildFixtureMatch(fixture) {
    const goy = (fixture.isGOY === false) ? false : true;
    const ecl = (fixture.isEclectic === false) ? false :
                (fixture.isEclectic === true) ? true : goy;
    return { isGOY: goy, isEclectic: ecl, isCaptains: fixture.isCaptains, fixture: fixture };
}

function matchCompetitionToFixture(compName, compDateStr) {
    if (!compName && !compDateStr) return null;
    const nameLower = (compName || '').toLowerCase();

    // Strategy 1: Check for "(GOY)" in the CSV competition name itself
    const hasGOYMarker = nameLower.includes('(goy)');

    // Strategy 2: two-pass match against the fixture list.
    //
    // Pass 2a (keyword-only) runs across the WHOLE fixture list before any date
    // check happens. This matters when two different fixtures land on the exact
    // same calendar date (e.g. the Captain's Prize Final and a standalone "Men's
    // Singles Stableford" round both played on 26 July): the Final's own files
    // always carry a distinctive "captain's prize" keyword and so are claimed
    // here, in full, before date matching is even considered. Doing keyword and
    // date matching as one combined per-fixture check, or preferring an exact
    // date match ahead of keywords, both mean whichever fixture happens to be
    // scanned/dated first wins a same-date match even when its keyword doesn't
    // match at all, misattributing a same-day standalone round to the wrong
    // fixture (or vice versa: misattributing the Captain's Prize Final itself
    // to an unrelated same-day fixture) purely by array position or date
    // collision. Keeping every Singles Stableford fixture's keyword
    // deliberately non-matching (see entries above) is what keeps this pass
    // safe: no keyword here is broad enough to hijack an unrelated date.
    for (const fixture of GOY_FIXTURES.competitions) {
        const keywordMatch = fixture.keywords.some(kw => nameLower.includes(kw));
        if (keywordMatch) return buildFixtureMatch(fixture);
    }

    // Pass 2b (date-only): only reached when no fixture's keyword matched at
    // all. Several fixtures (the standalone Sunday Singles Stableford rounds,
    // which all share one generic export name with no per-date keyword) rely
    // entirely on this pass, so array order between same-dated fixtures still
    // matters here; each such fixture is positioned immediately before any
    // other fixture that could otherwise share its date (see comments above
    // the Captain's Prize Final and 29/30 August entries).
    if (compDateStr) {
        for (const fixture of GOY_FIXTURES.competitions) {
            let dateMatch = false;
            const dateKey = extractFixtureDateKey(compDateStr);
            if (dateKey) {
                dateMatch = fixture.dates.includes(dateKey);
            }
            // Also try matching partial date strings
            if (!dateMatch) {
                // Extract ALL number tokens from the date string and compare as integers.
                // This avoids the old substring bug where day=2 matched "24" or "2026".
                const dayTokens = (compDateStr.match(/\d+/g) || []).map(t => parseInt(t, 10));
                for (const fd of fixture.dates) {
                    const fDate = new Date(fd);
                    const dayNum = fDate.getDate();
                    const monthNames = ['january','february','march','april','may','june',
                                        'july','august','september','october','november','december'];
                    const monthName = monthNames[fDate.getMonth()];
                    if (compDateStr.toLowerCase().includes(monthName) &&
                        dayTokens.includes(dayNum)) {
                        dateMatch = true;
                        break;
                    }
                }
            }
            if (dateMatch) return buildFixtureMatch(fixture);
        }
    }

    // Strategy 3: All medals from March to October are GOY-qualifying
    if (nameLower.includes('medal')) {
        const nonGoyMedalMonths = ['november', 'december', 'january', 'february'];
        const isExcluded = nonGoyMedalMonths.some(m => nameLower.includes(m));
        if (!isExcluded) {
            return { isGOY: true, isEclectic: true, isCaptains: false, fixture: null };
        }
    }

    // Strategy 4: If the CSV name contains "(GOY)" but didn't match a fixture,
    // still mark as GOY (future-proofing for mid-year additions)
    if (hasGOYMarker) {
        return { isGOY: true, isEclectic: true, isCaptains: false, fixture: null };
    }

    return null;
}

/**
 * Parse a date string like "5 April 2026" into ISO "2026-04-05".
 * Handles various formats from Handicap Master CSV exports.
 */
function extractFixtureDateKey(dateStr) {
    if (!dateStr) return null;
    const months = {
        jan:1, feb:2, mar:3, apr:4, may:5, jun:6,
        jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
        january:1, february:2, march:3, april:4, june:6,
        july:7, august:8, september:9, october:10, november:11, december:12
    };
    // Match patterns like "5 April 2026", "5th April 2026"
    const match = dateStr.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})/);
    if (match) {
        const m = months[match[2].toLowerCase()];
        if (m) return match[3] + '-' + String(m).padStart(2, '0') + '-' + match[1].padStart(2, '0');
    }
    return null;
}

/**
 * Get the fixture calendar status for UI display.
 * Returns fixtures with played/upcoming status based on loaded competitions.
 */
function getFixtureCalendar(loadedCompetitions) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return GOY_FIXTURES.competitions.map(fixture => {
        const firstDate = new Date(fixture.dates[0]);
        const lastDate = new Date(fixture.dates[fixture.dates.length - 1]);
        const isPast = lastDate < today;
        const isCurrent = firstDate <= today && lastDate >= today;

        // Check if this fixture has been uploaded (computed independently for GOY vs Eclectic)
        let uploadedForGOY = false;
        let uploadedForEclectic = false;
        if (loadedCompetitions) {
            const matchedComps = loadedCompetitions.filter(comp => {
                const nameLower = (comp.info.name || '').toLowerCase();
                const keywordMatch = fixture.keywords.some(kw => nameLower.includes(kw));
                const storedFixtureMatch = comp.fixtureMatch === fixture.name;
                const resolvedFixtureMatch = matchCompetitionToFixture(comp.info.name, comp.info.date);
                return keywordMatch ||
                    storedFixtureMatch ||
                    (resolvedFixtureMatch && resolvedFixtureMatch.fixture === fixture);
            });
            uploadedForGOY = matchedComps.some(c => c.config.isGOY);
            // Eclectic considers undefined as "include" for back-compat with older sessions
            uploadedForEclectic = matchedComps.some(c => c.config.isEclectic !== false);
        }

        return {
            ...fixture,
            isPast,
            isCurrent,
            isUpcoming: !isPast && !isCurrent,
            uploaded: uploadedForGOY, // back-compat alias used by the existing GOY tracker
            uploadedForGOY,
            uploadedForEclectic
        };
    });
}
