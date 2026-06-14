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

// Find all CSV files in Results and Scratch folders
const resultsPath = path.join('C:', 'Users', 'enkelly', 'OneDrive - Microsoft', 'Desktop', 'GoY_Ecclectic', 'Results');
const scratchPath = path.join('C:', 'Users', 'enkelly', 'OneDrive - Microsoft', 'Desktop', 'GoY_Ecclectic', 'Scratch');

const resultsCsvs = fs.readdirSync(resultsPath)
  .filter(f => f.endsWith('.csv'))
  .map(f => ({ filename: f, folder: resultsPath }))
  .sort((a, b) => a.filename.localeCompare(b.filename));

const scratchCsvs = fs.existsSync(scratchPath) ? fs.readdirSync(scratchPath)
  .filter(f => f.endsWith('.csv'))
  .map(f => ({ filename: f, folder: scratchPath }))
  .sort((a, b) => a.filename.localeCompare(b.filename)) : [];

const allCsvs = [...resultsCsvs, ...scratchCsvs];

console.log(`Found ${resultsCsvs.length} CSV files in Results folder`);
console.log(`Found ${scratchCsvs.length} CSV files in Scratch folder`);
console.log(`Found ${allCsvs.length} total CSV files`);

// Identify new files not in preload
const newFiles = allCsvs.filter(f => !existingFilenames.has(f.filename));

if (newFiles.length === 0) {
  console.log('No new CSV files to add.');
  process.exit(0);
}

console.log(`\nNew files to add (${newFiles.length}):`);
newFiles.forEach(f => console.log(`  - ${f.filename} (from ${f.folder.split('\\').pop()})`);

// Build new entries
const newEntries = [];
newFiles.forEach(file => {
  const filepath = path.join(file.folder, file.filename);
  const content = fs.readFileSync(filepath, 'utf8');
  
  // Escape quotes and newlines for JSON
  const escapedContent = content
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
  
  newEntries.push({
    filename: file.filename,
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
