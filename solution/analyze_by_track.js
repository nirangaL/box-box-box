const fs = require('fs');
const path = require('path');
const { simulate } = require('./race_simulator.js');

const inputDir = 'data/test_cases/inputs';
const outputDir = 'data/test_cases/expected_outputs';

const results = {};

for (let i = 1; i <= 100; i++) {
    const id = String(i).padStart(3, '0');
    const input = JSON.parse(fs.readFileSync(path.join(inputDir, `test_${id}.json`), 'utf8'));
    const expected = JSON.parse(fs.readFileSync(path.join(outputDir, `test_${id}.json`), 'utf8'));
    
    const pred = simulate(input);
    const pass = JSON.stringify(pred) === JSON.stringify(expected.finishing_positions);
    
    const track = input.race_config.track;
    if (!results[track]) results[track] = { pass: 0, total: 0 };
    results[track].total++;
    if (pass) results[track].pass++;
}

console.log('Track | Pass Rate');
console.log('-------------------');
for (const track in results) {
    const r = results[track];
    console.log(`${track.padEnd(12)} | ${r.pass}/${r.total} (${(r.pass/r.total*100).toFixed(1)}%)`);
}
