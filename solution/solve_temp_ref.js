const fs = require('fs');
const { simulate } = require('./race_simulator');

const TEST_DIR = 'data/test_cases';
const cases = [];
for (let i = 1; i <= 100; i++) {
    const id = String(i).padStart(3, '0');
    const input = JSON.parse(fs.readFileSync(`${TEST_DIR}/inputs/test_${id}.json`));
    const output = JSON.parse(fs.readFileSync(`${TEST_DIR}/expected_outputs/test_${id}.json`));
    cases.push({ input, expected: output.finishing_positions });
}

function score(p) {
    let exact = 0;
    for (const c of cases) {
        if (JSON.stringify(simulate(c.input, p)) === JSON.stringify(c.expected)) exact++;
    }
    return exact;
}

const pBase = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;

console.log('--- TEMPERATURE REFERENCE SWEEP ---');
for (let ref = 15; ref <= 40; ref += 1) {
    const p = JSON.parse(JSON.stringify(pBase));
    p.tempRef = ref;
    const s = score(p);
    console.log(`TempRef ${ref}: Score ${s}/100`);
    if (s > 58) {
        console.log("!!! ADVANCEMENT !!!");
    }
}
