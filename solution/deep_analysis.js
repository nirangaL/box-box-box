/**
 * Deep analysis of failed tests: Compare predicted vs expected positions
 * to understand what systematic patterns we're missing.
 */
const fs = require('fs');
const path = require('path');
const { simulate } = require('./race_simulator');

const inputDir = path.join(__dirname, '..', 'data', 'test_cases', 'inputs');
const expectedDir = path.join(__dirname, '..', 'data', 'test_cases', 'expected_outputs');

const params = JSON.parse(fs.readFileSync(path.join(__dirname, 'learned_params.json'), 'utf8')).params;

const failedIds = [1, 6, 8, 9, 12, 13, 14, 15, 24, 32, 33, 34, 36, 38, 40, 41, 42, 43, 49, 50, 55, 56, 57, 60, 62, 64, 65, 69, 71, 80, 81, 82, 83, 84, 88, 89, 90, 93, 95, 97, 98, 100];

// For each failed test, look at which drivers are misplaced and their strategies
for (const tid of failedIds.slice(0, 10)) { // Analyse first 10 for depth
    const id = String(tid).padStart(3, '0');
    const race = JSON.parse(fs.readFileSync(path.join(inputDir, `test_${id}.json`), 'utf8'));
    const expected = JSON.parse(fs.readFileSync(path.join(expectedDir, `test_${id}.json`), 'utf8')).finishing_positions;
    const predicted = simulate(race, params);
    
    const cfg = race.race_config;
    
    console.log(`\n${'='.repeat(70)}`);
    console.log(`TEST_${id}: ${cfg.track}, ${cfg.total_laps} laps, base=${cfg.base_lap_time}, pit=${cfg.pit_lane_time}, temp=${cfg.track_temp}`);
    
    // Build driver strategy map
    const driverStrat = {};
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        driverStrat[s.driver_id] = {
            grid: i,
            startTire: s.starting_tire,
            stops: s.pit_stops || [],
            numStops: (s.pit_stops || []).length
        };
    }
    
    // Compare positions
    console.log('Pos | Expected | Predicted | Strategy(expected driver)');
    console.log('----|----------|-----------|-------------------------');
    for (let i = 0; i < 20; i++) {
        const exp = expected[i];
        const pred = predicted[i];
        const match = exp === pred ? '  ' : '❌';
        const strat = driverStrat[exp];
        const stopStr = strat.stops.map(s => `L${s.lap}:${s.from_tire}→${s.to_tire}`).join(', ');
        console.log(`${String(i+1).padStart(3)} | ${exp.padEnd(8)} | ${pred.padEnd(9)} | ${match} grid=${strat.grid}, start=${strat.startTire}, stops=[${stopStr}]`);
    }
    
    // Analyze swaps - which drivers moved up/down
    const expPos = {};
    const predPos = {};
    for (let i = 0; i < 20; i++) {
        expPos[expected[i]] = i + 1;
        predPos[predicted[i]] = i + 1;
    }
    
    const movers = [];
    for (const d of Object.keys(expPos)) {
        const diff = predPos[d] - expPos[d];
        if (diff !== 0) movers.push({ driver: d, expP: expPos[d], predP: predPos[d], diff });
    }
    movers.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    
    console.log('\nBiggest misplacements:');
    for (const m of movers.slice(0, 6)) {
        const strat = driverStrat[m.driver];
        const stopStr = strat.stops.map(s => `L${s.lap}:${s.from_tire}→${s.to_tire}`).join(', ');
        const dir = m.diff > 0 ? '↓' : '↑';
        console.log(`  ${m.driver}: should be P${m.expP}, predicted P${m.predP} (${dir}${Math.abs(m.diff)}) | grid=${strat.grid}, ${strat.startTire}, [${stopStr}]`);
    }
}

// Now analyze patterns across all failures
console.log('\n\n' + '='.repeat(70));
console.log('PATTERN ANALYSIS ACROSS ALL FAILURES');
console.log('='.repeat(70));

// Check if there's a systematic bias: do multi-stoppers tend to finish better or worse in expected?
let multiStopBetter = 0, multiStopWorse = 0, singleStopBetter = 0, singleStopWorse = 0;
let softBetter = 0, softWorse = 0, hardBetter = 0, hardWorse = 0;

for (const tid of failedIds) {
    const id = String(tid).padStart(3, '0');
    const race = JSON.parse(fs.readFileSync(path.join(inputDir, `test_${id}.json`), 'utf8'));
    const expected = JSON.parse(fs.readFileSync(path.join(expectedDir, `test_${id}.json`), 'utf8')).finishing_positions;
    const predicted = simulate(race, params);
    
    const driverStrat = {};
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        driverStrat[s.driver_id] = {
            grid: i,
            startTire: s.starting_tire.toUpperCase(),
            numStops: (s.pit_stops || []).length
        };
    }
    
    const expPos = {};
    const predPos = {};
    for (let i = 0; i < 20; i++) {
        expPos[expected[i]] = i + 1;
        predPos[predicted[i]] = i + 1;
    }
    
    for (const d of Object.keys(expPos)) {
        const diff = predPos[d] - expPos[d]; // positive = we predicted worse than expected
        const strat = driverStrat[d];
        
        if (strat.numStops >= 2) {
            if (diff > 0) multiStopWorse++;
            else if (diff < 0) multiStopBetter++;
        } else {
            if (diff > 0) singleStopWorse++;
            else if (diff < 0) singleStopBetter++;
        }
        
        if (strat.startTire === 'SOFT') {
            if (diff > 0) softWorse++;
            else if (diff < 0) softBetter++;
        } else if (strat.startTire === 'HARD') {
            if (diff > 0) hardWorse++;
            else if (diff < 0) hardBetter++;
        }
    }
}

console.log(`\nMulti-stop drivers: predicted too low=${multiStopWorse}, too high=${multiStopBetter}`);
console.log(`Single-stop drivers: predicted too low=${singleStopWorse}, too high=${singleStopBetter}`);
console.log(`Soft starters: predicted too low=${softWorse}, too high=${softBetter}`);
console.log(`Hard starters: predicted too low=${hardWorse}, too high=${hardBetter}`);

// Analyze tempRef sensitivity
console.log('\n\nTemp distribution of failures:');
const tempDist = {};
for (const tid of failedIds) {
    const id = String(tid).padStart(3, '0');
    const race = JSON.parse(fs.readFileSync(path.join(inputDir, `test_${id}.json`), 'utf8'));
    const t = race.race_config.track_temp;
    tempDist[t] = (tempDist[t] || 0) + 1;
}
for (const [t, c] of Object.entries(tempDist).sort((a,b) => Number(a[0]) - Number(b[0]))) {
    console.log(`  temp=${t}: ${c} failures`);
}

// Check tempRef sensitivity
console.log('\n\nTesting different tempRef values:');
for (const tempRef of [20, 25, 28, 30, 32, 35, 40]) {
    const p = JSON.parse(JSON.stringify(params));
    p.tempRef = tempRef;
    let passed = 0;
    for (const tid of [1,2,3,4,5,6,7,8,9,10]) {  // Quick test subset
        const id = String(tid).padStart(3, '0');
        const race = JSON.parse(fs.readFileSync(path.join(inputDir, `test_${id}.json`), 'utf8'));
        const expected = JSON.parse(fs.readFileSync(path.join(expectedDir, `test_${id}.json`), 'utf8')).finishing_positions;
        const predicted = simulate(race, p);
        if (JSON.stringify(predicted) === JSON.stringify(expected)) passed++;
    }
    console.log(`  tempRef=${tempRef}: ${passed}/10 (first 10 tests)`);
}
