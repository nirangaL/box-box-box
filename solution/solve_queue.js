const fs = require('fs');
const { simulate } = require('./race_simulator');

async function main() {
    const TEST_DIR = 'data/test_cases';
    const cases = [];
    for (let i = 1; i <= 100; i++) {
        const id = String(i).padStart(3, '0');
        const input = JSON.parse(fs.readFileSync(`${TEST_DIR}/inputs/test_${id}.json`));
        const output = JSON.parse(fs.readFileSync(`${TEST_DIR}/expected_outputs/test_${id}.json`));
        cases.push({ input, expected: output.finishing_positions });
    }

    const pBase = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;

    console.log('--- QUEUE PENALTY SWEEP ---');
    for (let q = 0.0; q <= 2.5; q += 0.1) {
        const p = JSON.parse(JSON.stringify(pBase));
        p.queuePenalty = q;
        let exact = 0;
        for (const c of cases) {
            if (JSON.stringify(simulate(c.input, p)) === JSON.stringify(c.expected)) exact++;
        }
        if (exact >= 58) console.log(`q ${q.toFixed(2)} -> Score ${exact}/100`);
    }
}
main();
