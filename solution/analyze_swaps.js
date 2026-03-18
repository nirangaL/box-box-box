const fs = require('fs');
const path = require('path');
const { simulate } = require('./race_simulator.js');

const inputDir = 'data/test_cases/inputs';
const outputDir = 'data/test_cases/expected_outputs';

// For each failing test, show how many positions each driver is off by
let totalMisplacements = 0;
let totalTests = 0;
let swapAnalysis = { S_M: 0, S_H: 0, M_H: 0, same: 0 };

for (let i = 1; i <= 100; i++) {
    const id = String(i).padStart(3, '0');
    const input = JSON.parse(fs.readFileSync(path.join(inputDir, `test_${id}.json`), 'utf8'));
    const expected = JSON.parse(fs.readFileSync(path.join(outputDir, `test_${id}.json`), 'utf8'));
    const pred = simulate(input);
    const exp = expected.finishing_positions;

    if (JSON.stringify(pred) === JSON.stringify(exp)) continue;
    
    totalTests++;
    
    // Find misplacements
    const expMap = {}; exp.forEach((id, r) => expMap[id] = r);
    let misplace = 0;
    for (let j = 0; j < 20; j++) {
        if (pred[j] !== exp[j]) misplace++;
    }
    totalMisplacements += misplace;

    // For each adjacent swap, what tires are involved?
    const strats = input.strategies;
    const getTire = (driverId) => {
        for (let j = 1; j <= 20; j++) {
            const s = strats[`pos${j}`];
            if (s.driver_id === driverId) return s.starting_tire[0];
        }
        return '?';
    };
    
    // Find the first wrong prediction
    for (let j = 0; j < 19; j++) {
        if (pred[j] !== exp[j]) {
            const tPred = getTire(pred[j]);
            const tExp = getTire(exp[j]);
            if (tPred !== tExp) {
                const pair = [tPred, tExp].sort().join('_');
                swapAnalysis[pair] = (swapAnalysis[pair] || 0) + 1;
            } else {
                swapAnalysis['same'] = (swapAnalysis['same'] || 0) + 1;
            }
            break;
        }
    }
}

console.log(`\nFailing tests: ${totalTests}`);
console.log(`Avg misplaced drivers per fail: ${(totalMisplacements/totalTests).toFixed(1)}`);
console.log('\nFirst Wrong Prediction Tire Swaps:');
for (const [k, v] of Object.entries(swapAnalysis).sort((a,b)=>b[1]-a[1])) {
    console.log(`  ${k}: ${v}`);
}
