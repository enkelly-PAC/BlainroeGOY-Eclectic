// Final bracket: Final standings - Collins Cup 2026.pdf.
// Finalist awards: KO Chart - Collins Cup  2026.xlsx, D1:D2 (20 and 19).
// Shared awards rounded up to whole points, following GOY_Table_2025_-_19.pdf:
// losing semi-finalists 18, quarter-finalists 15, last-16 losers 9, last-32 losers 1.
// Use the PDF round columns: preliminary matches shift some spreadsheet cells.
// Total points awarded: 223.
const PRELOADED_GOY_COMPETITIONS = [
    {
        id: "collins_cup_2026",
        filename: "Collins Cup 2026 - Final standings",
        info: {
            name: "Collins Cup (Singles Matchplay)",
            date: "25 October 2026 (final deadline)",
            venue: "Blainroe Golf Club"
        },
        config: { isGOY: true, isEclectic: false, isCaptains: false },
        fixtureMatch: "Collins Cup (Singles Matchplay)",
        hasReport: true,
        hasScorecard: false,
        scorecards: {},
        handicaps: {},
        results: [
            { playerName: "Harrington, Eamonn", position: 1, goyPoints: 20 },
            { playerName: "O'Keefe, Peter", position: 2, goyPoints: 19 },
            { playerName: "Kelly, Edward", position: 3, goyPoints: 18 },
            { playerName: "Maughan, Peter", position: 3, goyPoints: 18 },
            { playerName: "Hurley, James", position: 5, goyPoints: 15 },
            { playerName: "Jameson, Conor", position: 5, goyPoints: 15 },
            { playerName: "Neiland, Joe", position: 5, goyPoints: 15 },
            { playerName: "Neiland, Michael", position: 5, goyPoints: 15 },
            { playerName: "Deignan, Paul F", position: 9, goyPoints: 9 },
            { playerName: "Forsyth, Kevin", position: 9, goyPoints: 9 },
            { playerName: "O'Brien, Alan", position: 9, goyPoints: 9 },
            { playerName: "O'Connor, Brian", position: 9, goyPoints: 9 },
            { playerName: "Russell Woods, Oscar", position: 9, goyPoints: 9 },
            { playerName: "Ryan, Jonathan", position: 9, goyPoints: 9 },
            { playerName: "Smyth, David", position: 9, goyPoints: 9 },
            { playerName: "Tymlin, Jonathon", position: 9, goyPoints: 9 },
            { playerName: "Beacom, Ross", position: 17, goyPoints: 1 },
            { playerName: "Brown, Ian", position: 17, goyPoints: 1 },
            { playerName: "Connor, Brian J.", position: 17, goyPoints: 1 },
            { playerName: "Doyle, J. C.", position: 17, goyPoints: 1 },
            { playerName: "Fitzpatrick, Liam", position: 17, goyPoints: 1 },
            { playerName: "Halion, Colin", position: 17, goyPoints: 1 },
            { playerName: "Harris, Gordon", position: 17, goyPoints: 1 },
            { playerName: "Higgins, Niall", position: 17, goyPoints: 1 },
            { playerName: "Jennings, Austin", position: 17, goyPoints: 1 },
            { playerName: "Kiersey, Robert", position: 17, goyPoints: 1 },
            { playerName: "Lawlor, Ronan", position: 17, goyPoints: 1 },
            { playerName: "Marren, Padraic", position: 17, goyPoints: 1 },
            { playerName: "McGuinness, Ger", position: 17, goyPoints: 1 },
            { playerName: "O'Malley, Gerard", position: 17, goyPoints: 1 },
            { playerName: "Pickerill, Robert", position: 17, goyPoints: 1 },
            { playerName: "Slattery, John", position: 17, goyPoints: 1 }
        ]
    }
];
