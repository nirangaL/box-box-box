const fs = require('fs');
const path = require('path');
const { simulate } = require('./race_simulator');

const root = path.join(__dirname, '..');
const inputsDir = path.join(root, 'data', 'test_cases', 'inputs');
const expectedDir = path.join(root, 'data', 'test_cases', 'expected_outputs');
const files = fs.readdirSync(inputsDir).filter(f=>f.endsWith('.json')).sort();

let pass=0, fail=0, firstFail=null;
for (const f of files) {
  const race = JSON.parse(fs.readFileSync(path.join(inputsDir,f), 'utf8'));
  const expected = JSON.parse(fs.readFileSync(path.join(expectedDir,f), 'utf8'));
  const predicted = simulate(race);
  const ok = JSON.stringify(predicted) === JSON.stringify(expected.finishing_positions);
  if (ok) pass++; else { fail++; if (!firstFail) firstFail={file:f,pred:predicted.slice(0,5),exp:expected.finishing_positions.slice(0,5)}; }
}
console.log(`Local runner (model only): total ${files.length}, pass ${pass}, fail ${fail}`);
if (firstFail) console.log('First failure detail:', firstFail);
