const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', 'data', 'test_cases');
function loadColdCases() {
    const cases = [];
    for (let i = 1; i <= 100; i++) {
        const id = String(i).padStart(3, '0');
        const input = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'inputs', `test_${id}.json`)));
        if (input.race_config.track_temp < 25) {
            const output = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'expected_outputs', `test_${id}.json`)));
            cases.push({ input, expected: output.finishing_positions, expectedRank: output.finishing_positions.reduce((acc, id, r) => { acc[id] = r; return acc; }, {}) });
        }
    }
    return cases;
}

const cases = loadColdCases();
console.log(`Loaded ${cases.length} cold cases`);

// ... same DE as super_optimizer but on 'cases' ...
