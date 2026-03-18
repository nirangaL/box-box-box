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
for (let val of [-2.0, -1.0, 0, 1.0, 2.0]) {
    const p = JSON.parse(JSON.stringify(original));
    p.pitExitPenalty = val;
    console.log(`pitExitPenalty=${val}: ${run(p)}`);
}

// Restore
fs.writeFileSync('solution/learned_params.json', JSON.stringify({params: original}, null, 2));
