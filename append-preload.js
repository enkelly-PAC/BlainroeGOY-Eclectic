const fs = require('fs');
const path = require('path');

// Read current preloaded data to get existing filenames
const preloadPath = path.join(__dirname, 'js', 'preloaded-data.js');
const preloadContent = fs.readFileSync(preloadPath, 'utf8');

// Extract existing filenames from PRELOADED_CSV_FILES
const existingFilenamesMatch = preloadContent.match(/"filename":\s*"([^"]+)"/g);
const existingFilenames = new Set();

if (existingFilenamesMatch) {
  existingFilenamesMatch.forEach(match => {
    const filename = match.replace(/"filename":\s*"/, '').replace(/"$/, '');
    existingFilenames.add(filename);
  });
}

console.log(`Found ${existingFilenames.size} existing entries in preloaded data`);

// Find all CSV files in Results folder (canonical source after Scratch copy)
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
    console.log(`\n⚠️  Warning: Scratch folder has ${scratchOnly.length} file(s) not in Results:`);
    scratchOnly.forEach(f => console.log(`  - ${f}`));
    console.log('Please copy these to Results folder before running append-preload again.\n');
    process.exit(1);
  }
  console.log(`Scratch folder check OK (${scratchCsvs.length} files, all in Results)\n`);
}

// Identify new files not in preload
const newFiles = resultsCsvs.filter(f => !existingFilenames.has(f));

if (newFiles.length === 0) {
  console.log('No new CSV files to add.');
  process.exit(0);
}

console.log(`\nNew files to add (${newFiles.length}):`);
newFiles.forEach(f => console.log(`  - ${f}`));

// Build new entries
const newEntries = [];
newFiles.forEach(filename => {
  const filepath = path.join(resultsPath, filename);
  const content = fs.readFileSync(filepath, 'utf8');
  
  // Escape quotes and newlines for JSON
  const escapedContent = content
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
  
  newEntries.push({
    filename: filename,
    content: escapedContent
  });
});

// Find where to insert (before the closing bracket)
const lastBracketIndex = preloadContent.lastIndexOf('];');
if (lastBracketIndex === -1) {
  console.error('Could not find closing bracket in preloaded-data.js');
  process.exit(1);
}

// Build the insertion: comma + new entries
let insertion = ',\n  ';
insertion += newEntries.map(entry => 
  `{\n    "filename": "${entry.filename}",\n    "content": "${entry.content}"\n  }`
).join(',\n  ');

// Splice it in
const before = preloadContent.substring(0, lastBracketIndex);
const after = preloadContent.substring(lastBracketIndex);

const updated = before + insertion + after;

// Update version and timestamp
const now = new Date();
const timestamp = now.toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
const versionMatch = updated.match(/const PRELOADED_DATA_VERSION = (\d+);/);
const currentVersion = versionMatch ? parseInt(versionMatch[1]) : 12;
const newVersion = currentVersion + 1;

const final = updated
  .replace(/const PRELOADED_DATA_VERSION = \d+;/, `const PRELOADED_DATA_VERSION = ${newVersion};`)
  .replace(/\/\/ Generated: .+/, `// Generated: ${timestamp}`);

// Write back
fs.writeFileSync(preloadPath, final, 'utf8');

console.log(`\n✓ Successfully appended ${newFiles.length} new CSV files`);
console.log(`✓ Version incremented: ${currentVersion} -> ${newVersion}`);
console.log(`✓ Updated: ${preloadPath}`);
