const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const repoRoot = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(repoRoot, 'js', 'app.js'), 'utf8');

function makeFakeElement() {
    return {
        style: {},
        innerHTML: '',
        textContent: '',
        children: [],
        appendChild(el) { this.children.push(el); },
        addEventListener() {},
        scrollIntoView() {},
        classList: { add() {}, remove() {} }
    };
}

const sandbox = {
    document: {
        addEventListener() {},
        getElementById() { return makeFakeElement(); },
        querySelector() { return makeFakeElement(); },
        querySelectorAll() { return []; },
        createElement() { return makeFakeElement(); }
    },
    window: {},
    localStorage: {
        getItem() { return null; },
        setItem() {},
        removeItem() {}
    },
    console,
    Date
};

vm.createContext(sandbox);
vm.runInContext(appSrc, sandbox, { filename: 'app.js' });

const replacementCharName = 'Professional\uFFFDs Prize to Men & PGA Tankard';
const mojibakeName = 'Professional\u00E2\u20AC\u2122s Prize to Men & PGA Tankard';
const expected = "Professional's Prize to Men & PGA Tankard";

assert.strictEqual(
    vm.runInContext(`normalizeDisplayText(${JSON.stringify(replacementCharName)})`, sandbox),
    expected
);
assert.strictEqual(
    vm.runInContext(`normalizeDisplayText(${JSON.stringify(mojibakeName)})`, sandbox),
    expected
);

const csv = [
    'Blainroe Golf Club',
    replacementCharName,
    'Printed: 16 August 2026',
    'Competition Result',
    'Aggregate result of the Competition played on Saturday 15 August 2026 and Sunday 16 August 2026 at Blainroe'
].join('\n');

const parsed = vm.runInContext(
    `extractCompetitionInfo(parseCSVLines(${JSON.stringify(csv)}))`,
    sandbox
);
assert.strictEqual(parsed.name, expected);

console.log('Competition text normalisation assertions passed.');
