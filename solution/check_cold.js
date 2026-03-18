const fs = require('fs');
const path = require('path');
const { simulate } = require('./race_simulator.js');

const tests = ["008", "014", "024", "038", "040", "064", "076", "080"];
const inputDir = 'data/test_cases/inputs';
const outputDir = 'data/test_cases/expected_outputs';

for (const id of tests) {
    const input = JSON.parse(fs.readFileSync(path.join(inputDir, `test_${id}.json`), 'utf8'));
    const expected = JSON.parse(fs.readFileSync(path.join(outputDir, `test_${id}.json`), 'utf8'));
    const pred = simulate(input);
    const passed = JSON.stringify(pred) === JSON.stringify(expected.finishing_positions);
    
    console.log(`Test ${id} (Temp=${input.race_config.track_temp}): ${passed ? 'PASS' : 'FAIL'}`);
    if (!passed) {
        // Find the first mismatch
        for (let j = 0; j < 20; j++) {
            if (pred[j] !== expected.finishing_positions[j]) {
                const pId = pred[j], eId = expected.finishing_positions[j];
                const pStrat = Object.values(input.strategies).find(s => s.driver_id === pId);
                const eStrat = Object.values(input.strategies).find(s => s.driver_id === eId);
                console.log(`  Mismatch at P${j+1}: Pred ${pId}(${pStrat.starting_tire[0]}) vs Exp ${eId}(${eStrat.starting_tire[0]})`);
                // Check if one is a HARD tire
                break;
            }
        }
    }
}
