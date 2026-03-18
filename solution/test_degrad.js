const fs = require('fs');
const { simulate } = require('./race_simulator.js');

const s = JSON.parse(fs.readFileSync('solution/learned_params.json')).params;
const cases = [];
const TEST_DIR = 'data/test_cases';
for (let i = 1; i <= 100; i++) {
    const id = String(i).padStart(3, '0');
    const input = JSON.parse(fs.readFileSync(`${TEST_DIR}/inputs/test_${id}.json`));
    const output = JSON.parse(fs.readFileSync(`${TEST_DIR}/expected_outputs/test_${id}.json`));
    cases.push({ input, exp: output.finishing_positions });
}

function run(pObj) {
    fs.writeFileSync('solution/learned_params.json', JSON.stringify({params: pObj}, null, 2));
    let passed = 0;
    for (const c of cases) {
        if (JSON.stringify(simulate(c.input)) === JSON.stringify(c.exp)) passed++;
    }
    return passed;
}

const original = JSON.parse(JSON.stringify(s));
console.log(`Original Pass: ${run(original)}`);

for (let scale of [0.5, 0.7, 0.9, 1.1, 1.2]) {
    const p = JSON.parse(JSON.stringify(original));
    p.degr1.SOFT *= scale; p.degr1.MEDIUM *= scale; p.degr1.HARD *= scale;
    p.degr2.SOFT *= scale; p.degr2.MEDIUM *= scale; p.degr2.HARD *= scale;
    console.log(`Scale ${scale}: ${run(p)}`);
}

// Restore
fs.writeFileSync('solution/learned_params.json', JSON.stringify({params: original}, null, 2));
