const fs = require('fs');
const path = require('path');
const { simulate } = require('./race_simulator.js');

const inputDir = 'data/test_cases/inputs';
const outputDir = 'data/test_cases/expected_outputs';

let passed = 0;
for (let i = 1; i <= 100; i++) {
    const id = String(i).padStart(3, '0');
    const input = JSON.parse(fs.readFileSync(path.join(inputDir, `test_${id}.json`), 'utf8'));
    const expected = JSON.parse(fs.readFileSync(path.join(outputDir, `test_${id}.json`), 'utf8'));
    
    const pred = simulate(input);
    if (JSON.stringify(pred) === JSON.stringify(expected.finishing_positions)) {
        passed++;
    }
}
console.log(`Final Verification Score: ${passed}/100`);
