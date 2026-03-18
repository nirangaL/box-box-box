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

const baseline = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;
console.log('Initial Score (no fuel):', score(baseline));

// Sweep fuelPace (assuming same for all compounds for simplicity first)
for (let fp = 0.001; fp <= 0.05; fp += 0.002) {
    for (let fw = 0.01; fw <= 0.2; fw += 0.02) {
        const p = JSON.parse(JSON.stringify(baseline));
        ['SOFT', 'MEDIUM', 'HARD'].forEach(ti => {
            p.fuelPace[ti] = fp;
            p.fuelWear[ti] = fw;
        });
        const s = score(p);
        if (s > 58) {
            console.log(`fp ${fp.toFixed(3)}, fw ${fw.toFixed(3)} -> Score ${s}`);
            if (s >= 90) {
                console.log("!!! GOAL REACHED !!!");
                fs.writeFileSync('solution/learned_params_top.json', JSON.stringify({params: p, score: s}, null, 2));
            }
        }
    }
}
