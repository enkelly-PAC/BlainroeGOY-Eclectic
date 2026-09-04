const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============ NORMALISATION / FINGERPRINT HELPERS ============
// Shared by both the "already embedded under this filename?" check and the
// "is this the same competition embedded under a DIFFERENT filename?" check,
// so a renamed copy of an already-processed competition (identical scores,
// different export filename) is detected and skipped rather than silently
// creating a second, duplicate competition entry.

// Normalise CSV content for identity comparison: unify line endings, drop the
// "Printed: <date>" export-timestamp line (the one line that legitimately
// differs between two exports of the same underlying competition data), trim
// each line, and drop blank lines. This is content identity, not byte identity.
function normalizeCsvForFingerprint(content) {
  return content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter(line => !/^"Printed:/.test(line.trim()))
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');
}

function fingerprintOf(content) {
  return crypto.createHash('sha256').update(normalizeCsvForFingerprint(content)).digest('hex');
}

// ============ MAIN SCRIPT (only runs when invoked directly, e.g. `node
// append-preload.js` or via Step1-IngestCsvs.ps1) ============
// Guarded so tools/test-append-preload-fingerprint.js can `require()` this
// file purely for the normalisation/fingerprint helpers above, without
// touching the real Results folder or js/preloaded-data.js on disk.
if (require.main === module) {

// ============ READ CURRENT PRELOADED DATA ============

const preloadPath = path.join(__dirname, 'js', 'preloaded-data.js');
const preloadContent = fs.readFileSync(preloadPath, 'utf8');

const arrayMatch = preloadContent.match(/const PRELOADED_CSV_FILES = (\[[\s\S]*\]);/);
if (!arrayMatch) {
  console.error('Could not find PRELOADED_CSV_FILES array in preloaded-data.js');
  process.exit(1);
}
// The array literal only contains string/object data (no executable logic),
// so evaluating it here is a safe, reusable way to get real JS strings back
// (unescaped), rather than re-implementing escaping/unescaping by hand.
const entries = eval(arrayMatch[1]);

const entryByFilename = new Map(entries.map(e => [e.filename, e]));
const fingerprintToFilename = new Map(entries.map(e => [fingerprintOf(e.content), e.filename]));

console.log(`Found ${entries.length} existing entries in preloaded data`);

// ============ READ RESULTS FOLDER ============

const resultsPath = path.join('C:', 'Users', 'enkelly', 'OneDrive - Microsoft', 'Desktop', 'GoY_Ecclectic', 'Results');
const scratchPath = path.join('C:', 'Users', 'enkelly', 'OneDrive - Microsoft', 'Desktop', 'GoY_Ecclectic', 'Scratch');

const resultsCsvs = fs.readdirSync(resultsPath)
  .filter(f => f.endsWith('.csv'))
  .sort((a, b) => a.localeCompare(b));

console.log(`Found ${resultsCsvs.length} CSV files in Results folder (canonical source)`);

// Check if Scratch folder has any files missing from Results (safety check)
if (fs.existsSync(scratchPath)) {
  const scratchCsvs = fs.readdirSync(scratchPath)
    .filter(f => f.endsWith('.csv'));

  const scratchOnly = scratchCsvs.filter(f => !resultsCsvs.includes(f));
  if (scratchOnly.length > 0) {
    console.log(`\nWarning: Scratch folder has ${scratchOnly.length} file(s) not in Results:`);
    scratchOnly.forEach(f => console.log(`  - ${f}`));
    console.log('Please copy these to Results folder before running append-preload again.\n');
    process.exit(1);
  }
  console.log(`Scratch folder check OK (${scratchCsvs.length} files, all in Results)\n`);
}

// ============ CLASSIFY EACH RESULTS FILE ============
//
// For every CSV currently in Results, decide one of:
//   - "unchanged"  : filename already embedded, content fingerprint matches -> skip
//   - "replace"    : filename already embedded, content fingerprint differs ->
//                    reported only, NOT applied automatically (see below)
//   - "duplicate"  : filename NOT embedded, but its content fingerprint matches
//                    an ALREADY-EMBEDDED entry under a different filename -> skip,
//                    report as a detected duplicate (this is the renamed-copy case)
//   - "add"        : filename NOT embedded, content fingerprint not seen before -> append
//
// Replacement is opt-in (pass --apply-replacements) rather than automatic.
// A changed same-name file is often a genuinely unrelated, pre-existing
// competition whose Results export happens to differ from what's embedded
// (e.g. a source system re-exporting a stale date field); silently
// overwriting it as a side effect of an ingest run for unrelated new
// competitions could undo a prior, deliberate manual correction. Reporting
// it clearly and requiring an explicit flag keeps replacement "safe and
// transparent" rather than silent.
const applyReplacements = process.argv.includes('--apply-replacements');

const toAdd = [];
const toReplace = [];
const duplicatesSkipped = [];
const unchanged = [];

for (const filename of resultsCsvs) {
  const filepath = path.join(resultsPath, filename);
  const content = fs.readFileSync(filepath, 'utf8');
  const fp = fingerprintOf(content);

  const existingByName = entryByFilename.get(filename);
  if (existingByName) {
    if (fingerprintOf(existingByName.content) === fp) {
      unchanged.push(filename);
    } else {
      toReplace.push({ filename, content });
    }
    continue;
  }

  const duplicateOfFilename = fingerprintToFilename.get(fp);
  if (duplicateOfFilename) {
    duplicatesSkipped.push({ filename, duplicateOfFilename });
    continue;
  }

  // New, unique content: register its fingerprint immediately so a second
  // new file in this same Results folder with identical content (e.g. two
  // differently-named drops of the same competition landing in the same
  // run) is also caught as a duplicate rather than both being appended.
  fingerprintToFilename.set(fp, filename);
  toAdd.push({ filename, content });
}

// ============ REPORT ============

if (duplicatesSkipped.length > 0) {
  console.log(`\nDetected ${duplicatesSkipped.length} duplicate file(s) (renamed copy of already-embedded content), skipped:`);
  duplicatesSkipped.forEach(d => console.log(`  - ${d.filename}  (same content as embedded: ${d.duplicateOfFilename})`));
}

if (toReplace.length > 0) {
  if (applyReplacements) {
    console.log(`\nDetected ${toReplace.length} changed file(s) (same filename, different content), replacing in place (--apply-replacements set):`);
  } else {
    console.log(`\nDetected ${toReplace.length} changed file(s) (same filename, different content). NOT auto-replacing (rerun with --apply-replacements to apply after review):`);
  }
  toReplace.forEach(r => console.log(`  - ${r.filename}`));
}

if (toAdd.length === 0 && (toReplace.length === 0 || !applyReplacements)) {
  console.log('\nNo new CSV files to add.' + (toReplace.length > 0 ? ' (changed files listed above were left untouched)' : ''));
  process.exit(0);
}

if (toAdd.length > 0) {
  console.log(`\nNew files to add (${toAdd.length}):`);
  toAdd.forEach(f => console.log(`  - ${f.filename}`));
}

// ============ APPLY CHANGES TO THE IN-MEMORY ENTRY LIST ============

if (applyReplacements) {
  for (const { filename, content } of toReplace) {
    const entry = entryByFilename.get(filename);
    entry.content = content;
  }
}
for (const { filename, content } of toAdd) {
  entries.push({ filename, content });
}

// ============ SERIALISE BACK OUT ============
// Rebuilding the whole array (rather than string-splicing new entries before
// the closing bracket, as before) makes in-place replacement of a changed
// same-name file possible/safe and keeps one escaping implementation as the
// single source of truth for both add and replace paths.

function escapeForJsString(content) {
  return content
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

const serializedEntries = entries.map(entry =>
  `  {\n    "filename": "${entry.filename}",\n    "content": "${escapeForJsString(entry.content)}"\n  }`
).join(',\n');

const newArrayLiteral = `const PRELOADED_CSV_FILES = [\n${serializedEntries}\n];`;

const updated = preloadContent.replace(/const PRELOADED_CSV_FILES = \[[\s\S]*\];/, newArrayLiteral);

// Update version and timestamp
const now = new Date();
const timestamp = now.toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
const versionMatch = updated.match(/const PRELOADED_DATA_VERSION = (\d+);/);
const currentVersion = versionMatch ? parseInt(versionMatch[1], 10) : 12;
const newVersion = currentVersion + 1;

const final = updated
  .replace(/const PRELOADED_DATA_VERSION = \d+;/, `const PRELOADED_DATA_VERSION = ${newVersion};`)
  .replace(/\/\/ Generated: .+/, `// Generated: ${timestamp}`);

fs.writeFileSync(preloadPath, final, 'utf8');

console.log(`\nSuccessfully updated preloaded data: ${toAdd.length} added, ${applyReplacements ? toReplace.length : 0} replaced, ${duplicatesSkipped.length} duplicates skipped, ${unchanged.length} unchanged.`);
console.log(`Version incremented: ${currentVersion} -> ${newVersion}`);
console.log(`Updated: ${preloadPath}`);

} // end require.main === module guard

module.exports = { normalizeCsvForFingerprint, fingerprintOf };
