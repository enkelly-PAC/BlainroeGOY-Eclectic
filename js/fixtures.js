// ============================================================
// Blainroe Golf Club - 2026 GOY Fixture Configuration
// ============================================================
// Update this file each year with the new fixture list.
// The app uses this to auto-detect GOY and Captain's Prize
// competitions when CSV files are uploaded.
// ============================================================

const GOY_FIXTURES = {
    year: 2026,

    // All GOY-qualifying competitions for the year.
    // Each entry: { name, keywords, dates (ISO), isCaptains, category }
    // 'keywords' are lowercase fragments matched against CSV competition names.
    // 'dates' are the Sat/Sun (or multi-day) dates for the competition.
    competitions: [
        {
            name: "Men's March Medal (GOY)",
            keywords: ["march medal"],
            dates: ["2026-04-04", "2026-04-05"],
            isCaptains: false,
            category: "Medal"
        },
        {
            name: "Men's April Medal",
            keywords: ["april medal"],
            dates: ["2026-04-18", "2026-04-19"],
            isCaptains: false,
            category: "Medal"
        },
        {
            name: "Peter Roper Cup (GOY)",
            keywords: ["peter roper"],
            dates: ["2026-04-25", "2026-04-26"],
            isCaptains: false,
            category: "GOY Trophy"
        },
        {
            name: "Men's May Medal",
            keywords: ["may medal"],
            dates: ["2026-05-02", "2026-05-03"],
            isCaptains: false,
            category: "Medal"
        },
        {
            name: "McCrea Cup (GOY)",
            keywords: ["mccrea"],
            dates: ["2026-05-09", "2026-05-10"],
            isCaptains: false,
            category: "GOY Trophy"
        },
        {
            name: "Lady Captain's Prize to Men (GOY)",
            keywords: ["lady captain", "hilary flynn"],
            dates: ["2026-05-23", "2026-05-24"],
            isCaptains: false,
            category: "GOY Trophy"
        },
        {
            name: "President's Prize to Men",
            keywords: ["president's prize to men", "presidents prize to men"],
            dates: ["2026-05-30"],
            isCaptains: false,
            category: "President's Prize"
        },
        {
            name: "Men's June Medal",
            keywords: ["june medal"],
            dates: ["2026-06-06", "2026-06-07"],
            isCaptains: false,
            category: "Medal"
        },
        {
            name: "WH Scott Trophy (GOY)",
            keywords: ["wh scott", "w.h. scott", "w h scott"],
            dates: ["2026-06-13", "2026-06-14"],
            isCaptains: false,
            category: "GOY Trophy"
        },
        {
            name: "Lady President's Prize to Men (GOY)",
            keywords: ["lady president"],
            dates: ["2026-06-27", "2026-06-28"],
            isCaptains: false,
            category: "GOY Trophy"
        },
        {
            name: "Men's July Medal",
            keywords: ["july medal"],
            dates: ["2026-07-11", "2026-07-12"],
            isCaptains: false,
            category: "Medal"
        },
        {
            name: "Captain's Prize to Men",
            keywords: ["captains prize", "captain's prize", "gary kennedy"],
            dates: ["2026-07-18", "2026-07-19", "2026-07-25"],
            isCaptains: true,
            category: "Captain's Prize"
        },
        {
            name: "Men's August Medal",
            keywords: ["august medal"],
            dates: ["2026-08-08", "2026-08-09"],
            isCaptains: false,
            category: "Medal"
        },
        {
            name: "Professional's Prize & PGA Tankard (GOY)",
            keywords: ["professional", "pga tankard"],
            dates: ["2026-08-15", "2026-08-16"],
            isCaptains: false,
            category: "GOY Trophy"
        },
        {
            name: "Men's September Medal",
            keywords: ["september medal"],
            dates: ["2026-09-05", "2026-09-06"],
            isCaptains: false,
            category: "Medal"
        },
        {
            name: "C.G. Cooney Trophy (GOY)",
            keywords: ["cooney"],
            dates: ["2026-09-12", "2026-09-13"],
            isCaptains: false,
            category: "GOY Trophy"
        },
        {
            name: "Men's October Medal",
            keywords: ["october medal"],
            dates: ["2026-09-26", "2026-09-27"],
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
function matchCompetitionToFixture(compName, compDateStr) {
    if (!compName && !compDateStr) return null;
    const nameLower = (compName || '').toLowerCase();

    // Strategy 1: Check for "(GOY)" in the CSV competition name itself
    const hasGOYMarker = nameLower.includes('(goy)');

    // Strategy 2: Keyword match against fixture list
    for (const fixture of GOY_FIXTURES.competitions) {
        // Check keywords against competition name
        const keywordMatch = fixture.keywords.some(kw => nameLower.includes(kw));

        // Check date match
        let dateMatch = false;
        if (compDateStr) {
            const dateKey = extractFixtureDateKey(compDateStr);
            if (dateKey) {
                dateMatch = fixture.dates.includes(dateKey);
            }
            // Also try matching partial date strings
            if (!dateMatch) {
                for (const fd of fixture.dates) {
                    const fDate = new Date(fd);
                    const dayNum = fDate.getDate();
                    const monthNames = ['january','february','march','april','may','june',
                                        'july','august','september','october','november','december'];
                    const monthName = monthNames[fDate.getMonth()];
                    if (compDateStr.toLowerCase().includes(monthName) &&
                        compDateStr.includes(String(dayNum))) {
                        dateMatch = true;
                        break;
                    }
                }
            }
        }

        if (keywordMatch || (dateMatch && hasGOYMarker)) {
            return { isGOY: true, isCaptains: fixture.isCaptains, fixture: fixture };
        }
    }

    // Strategy 3: All medals (March–October) are GOY-qualifying
    if (nameLower.includes('medal')) {
        const nonGoyMedalMonths = ['november', 'december', 'january', 'february'];
        const isExcluded = nonGoyMedalMonths.some(m => nameLower.includes(m));
        if (!isExcluded) {
            return { isGOY: true, isCaptains: false, fixture: null };
        }
    }

    // Strategy 4: If the CSV name contains "(GOY)" but didn't match a fixture,
    // still mark as GOY (future-proofing for mid-year additions)
    if (hasGOYMarker) {
        return { isGOY: true, isCaptains: false, fixture: null };
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

        // Check if this fixture has been uploaded
        let uploaded = false;
        if (loadedCompetitions) {
            uploaded = loadedCompetitions.some(comp => {
                if (!comp.config.isGOY) return false;
                const nameLower = (comp.info.name || '').toLowerCase();
                return fixture.keywords.some(kw => nameLower.includes(kw));
            });
        }

        return {
            ...fixture,
            isPast,
            isCurrent,
            isUpcoming: !isPast && !isCurrent,
            uploaded
        };
    });
}
