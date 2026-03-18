const fs = require('fs');
const path = require('path');
const { simulate } = require('./race_simulator.js');

const inputDir = 'data/test_cases/inputs';
const outputDir = 'data/test_cases/expected_outputs';

// For each failing test, investigate HARD tire overperformance
// If pred ranks HARD too low → our pace offset for HARD is too negative (HARD too slow in our sim)
// If pred ranks HARD vs SOFT wrong → crossover logic is wrong

let hardTooSlow = 0, softTooSlow = 0, mediumTooSlow = 0;

for (let i = 1; i <= 100; i++) {
    const id = String(i).padStart(3, '0');
    const input = JSON.parse(fs.readFileSync(path.join(inputDir, `test_${id}.json`), 'utf8'));
    const expected = JSON.parse(fs.readFileSync(path.join(outputDir, `test_${id}.json`), 'utf8'));
    const pred = simulate(input);
    const exp = expected.finishing_positions;

    if (JSON.stringify(pred) === JSON.stringify(exp)) continue;
    
    const expMap = {}; exp.forEach((id, r) => expMap[id] = r);
    const strats = input.strategies;
    const getTire = (driverId) => {
        for (let j = 1; j <= 20; j++) {
            const s = strats[`pos${j}`];
            if (s.driver_id === driverId) return s.starting_tire[0];
        }
        return '?';
    };
    
    // Check pairs: if driver A is ranked above driver B in pred, but below in exp
    // Count how often H is being put too far back
    for (let j = 0; j < 20; j++) {
        const predRank = j;
        const expRank = expMap[pred[j]];
        const tire = getTire(pred[j]);
        
        if (expRank > predRank) {  // we predicted too high (actually slower)
            // The actual car was SLOWER than we thought
            if (tire === 'H') hardTooSlow++;
            else if (tire === 'S') softTooSlow++;
            else if (tire === 'M') mediumTooSlow++;
        }
    }
}

console.log('Cars predicted too HIGH (actually finished lower than we predicted):');
console.log(`  HARD starters predicted too high: ${hardTooSlow}`);
console.log(`  SOFT starters predicted too high: ${softTooSlow}`);
console.log(`  MEDIUM starters predicted too high: ${mediumTooSlow}`);
console.log('\nIf HARD is predicted too high: we overestimate HARD pace (HARD offset too big)');
console.log('If HARD is predicted too low: we underestimate HARD pace (HARD offset too small)');
