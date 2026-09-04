// Regression test for the append-preload.js content-fingerprint helpers used
// to detect a renamed duplicate CSV (identical competition data exported
// under a different filename) so it is skipped rather than silently embedded
// a second time.
//
// Run with: node tools\test-append-preload-fingerprint.js

const assert = require('assert');
const { normalizeCsvForFingerprint, fingerprintOf } = require('../append-preload.js');

const originalContent =
    '"Blainroe Golf Club"\r\n' +
    '"Competition Scorecards"\r\n' +
    '"Printed: 4 September 2026"\r\n' +
    '"Hole by Hole scores returned in the Men\'s Singles Stableford competition round played on 31 May 2026 at Blainroe (Blainroe  Main)"\r\n' +
    '"Player(s)","","1","2","3"\r\n' +
    '"Murphy, Sean "," ","5","4","4"\r\n';

// Same competition, re-exported later (different "Printed:" timestamp and
// CRLF vs LF line endings), as happens when a club export tool is re-run.
const renamedDuplicateContent =
    '"Blainroe Golf Club"\n' +
    '"Competition Scorecards"\n' +
    '"Printed: 10 September 2026"\n' +
    '"Hole by Hole scores returned in the Men\'s Singles Stableford competition round played on 31 May 2026 at Blainroe (Blainroe  Main)"\n' +
    '"Player(s)","","1","2","3"\n' +
    '"Murphy, Sean "," ","5","4","4"\n';

// A genuinely different competition (different scores), which must NOT be
// treated as a duplicate even though most of the header lines are identical.
const differentContent =
    '"Blainroe Golf Club"\r\n' +
    '"Competition Scorecards"\r\n' +
    '"Printed: 4 September 2026"\r\n' +
    '"Hole by Hole scores returned in the Men\'s Singles Stableford competition round played on 21 June 2026 at Blainroe (Blainroe  Main)"\r\n' +
    '"Player(s)","","1","2","3"\r\n' +
    '"Murphy, Sean "," ","6","4","4"\r\n';

assert.strictEqual(
    fingerprintOf(originalContent),
    fingerprintOf(renamedDuplicateContent),
    'a renamed re-export of the same competition (different Printed: date, different line endings) must fingerprint identically'
);

assert.notStrictEqual(
    fingerprintOf(originalContent),
    fingerprintOf(differentContent),
    'a genuinely different competition must NOT fingerprint the same, even with a near-identical header'
);

// normalizeCsvForFingerprint itself should drop the Printed: line and blank lines.
const normalized = normalizeCsvForFingerprint(originalContent);
assert.ok(!normalized.includes('Printed:'), 'normalized content must not include the Printed: timestamp line');
assert.ok(normalized.includes('Murphy, Sean'), 'normalized content must still include the actual score data');

console.log('All append-preload fingerprint regression assertions passed.');
