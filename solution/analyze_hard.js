const fs = require('fs');
const path = require('path');
const { simulate } = require('./race_simulator.js');

// Specifically: Find cases where HARD starters are in the expected top10 but we predict them lower
// This tells us if HARD cars need a freshness bonus on a long initial stint

const inputDir = 'data/test_cases/inputs';
const outputDir = 'data/test_cases/expected_outputs';

for (let i = 1; i <= 100; i++) {
    const id = String(i).padStart(3, '0');
    const input = JSON.parse(fs.readFileSync(path.join(inputDir, `test_${id}.json`), 'utf8'));
    const expected = JSON.parse(fs.readFileSync(path.join(outputDir, `test_${id}.json`), 'utf8'));
    const pred = simulate(input);
    const exp = expected.finishing_positions;

    if (JSON.stringify(pred) === JSON.stringify(exp)) continue;
    
    const expMap = {}; exp.forEach((id, r) => expMap[id] = r);
    const predMap = {}; pred.forEach((id, r) => predMap[id] = r);
    const strats = input.strategies;
    
    // Find HARD starters in top 10 expected
    for (let j = 1; j <= 20; j++) {
        const s = strats[`pos${j}`];
        if (s.starting_tire[0] !== 'H') continue;
        
        const expRank = expMap[s.driver_id];
        const predRank = predMap[s.driver_id];
        
        if (expRank < 10 && predRank - expRank > 3) {  // Expected top 10 but predicted much lower
            const pitLap = (s.pit_stops[0]?.lap) || 0;
            const laps = input.race_config.total_laps;
            const temp = input.race_config.track_temp;
            console.log(`TEST ${i} (${input.race_config.track}, T=${temp}, L=${laps}): D${j}(H) Expected P${expRank+1} but Predicted P${predRank+1}, PitLap=${pitLap}`);
        }
    }
}
console.log('Done. HARD overperformers were displayed above.');
