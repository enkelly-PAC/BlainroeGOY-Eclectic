// Final bracket: Final standings - Collins Cup 2026.pdf.
// Awards: KO Chart - Collins Cup  2026.xlsx, "GOY points assigned", D1:D32.
// Use the PDF round columns: preliminary matches shift some spreadsheet cells.
// Tied groups share the available top-20 points, including 0.625 for each of
// the 16 players tied 17th. Total points awarded: 210.
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
            { playerName: "Kelly, Edward", position: 3, goyPoints: 17.5 },
            { playerName: "Maughan, Peter", position: 3, goyPoints: 17.5 },
            { playerName: "Hurley, James", position: 5, goyPoints: 14.5 },
            { playerName: "Jameson, Conor", position: 5, goyPoints: 14.5 },
            { playerName: "Neiland, Joe", position: 5, goyPoints: 14.5 },
            { playerName: "Neiland, Michael", position: 5, goyPoints: 14.5 },
            { playerName: "Deignan, Paul F", position: 9, goyPoints: 8.5 },
            { playerName: "Forsyth, Kevin", position: 9, goyPoints: 8.5 },
            { playerName: "O'Brien, Alan", position: 9, goyPoints: 8.5 },
            { playerName: "O'Connor, Brian", position: 9, goyPoints: 8.5 },
            { playerName: "Russell Woods, Oscar", position: 9, goyPoints: 8.5 },
            { playerName: "Ryan, Jonathan", position: 9, goyPoints: 8.5 },
            { playerName: "Smyth, David", position: 9, goyPoints: 8.5 },
            { playerName: "Tymlin, Jonathon", position: 9, goyPoints: 8.5 },
            { playerName: "Beacom, Ross", position: 17, goyPoints: 0.625 },
            { playerName: "Brown, Ian", position: 17, goyPoints: 0.625 },
            { playerName: "Connor, Brian J.", position: 17, goyPoints: 0.625 },
            { playerName: "Doyle, J. C.", position: 17, goyPoints: 0.625 },
            { playerName: "Fitzpatrick, Liam", position: 17, goyPoints: 0.625 },
            { playerName: "Halion, Colin", position: 17, goyPoints: 0.625 },
            { playerName: "Harris, Gordon", position: 17, goyPoints: 0.625 },
            { playerName: "Higgins, Niall", position: 17, goyPoints: 0.625 },
            { playerName: "Jennings, Austin", position: 17, goyPoints: 0.625 },
            { playerName: "Kiersey, Robert", position: 17, goyPoints: 0.625 },
            { playerName: "Lawlor, Ronan", position: 17, goyPoints: 0.625 },
            { playerName: "Marren, Padraic", position: 17, goyPoints: 0.625 },
            { playerName: "McGuinness, Ger", position: 17, goyPoints: 0.625 },
            { playerName: "O'Malley, Gerard", position: 17, goyPoints: 0.625 },
            { playerName: "Pickerill, Robert", position: 17, goyPoints: 0.625 },
            { playerName: "Slattery, John", position: 17, goyPoints: 0.625 }
        ]
    }
];
