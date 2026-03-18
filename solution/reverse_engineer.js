/**
 * Clean analysis - output to file instead of terminal to avoid truncation
 */
const fs = require('fs');
const path = require('path');
const { simulate } = require('./race_simulator');

const histDir = path.join(__dirname, '..', 'data', 'historical_races');
const races = JSON.parse(fs.readFileSync(path.join(histDir, 'races_00000-00999.json'), 'utf8'));

const currentParams = JSON.parse(fs.readFileSync(path.join(__dirname, 'learned_params.json'), 'utf8')).params;
['degrExp', 'fuelPace', 'fuelWear'].forEach(key => {
    if (!currentParams[key]) currentParams[key] = {};
    ['SOFT', 'MEDIUM', 'HARD'].forEach(t => {
        if (currentParams[key][t] === undefined) currentParams[key][t] = key === 'degrExp' ? 2 : 0;
    });
});

const out = [];
const log = (...args) => out.push(args.join(' '));

// Test historical accuracy 
let histPassed = 0;
const failedByTemp = {};
const totalByTemp = {};

for (const race of races) {
    const t = race.race_config.track_temp;
    totalByTemp[t] = (totalByTemp[t] || 0) + 1;
    
    const input = { race_id: race.race_id, race_config: race.race_config, strategies: race.strategies };
    const predicted = simulate(input, currentParams);
    if (JSON.stringify(predicted) === JSON.stringify(race.finishing_positions)) {
        histPassed++;
    } else {
        failedByTemp[t] = (failedByTemp[t] || 0) + 1;
    }
}

log(`Historical accuracy: ${histPassed}/1000 (${(histPassed/10).toFixed(1)}%)`);
log('');
log('Failed by temperature:');
for (const t of Object.keys(totalByTemp).sort((a,b) => Number(a) - Number(b))) {
    const failed = failedByTemp[t] || 0;
    const total = totalByTemp[t];
    const pct = (failed/total*100).toFixed(0);
    log(`  temp=${String(t).padStart(2)}: ${String(failed).padStart(3)} failed / ${String(total).padStart(3)} total (${pct}% fail)`);
}

// Count near-misses  
let minorSwaps = 0;
let totalFailed = 0;

for (const race of races) {
    const input = { race_id: race.race_id, race_config: race.race_config, strategies: race.strategies };
    const predicted = simulate(input, currentParams);
    const expected = race.finishing_positions;
    
    if (JSON.stringify(predicted) === JSON.stringify(expected)) continue;
    totalFailed++;
    
    let maxDisp = 0;
    for (let i = 0; i < 20; i++) {
        const d = expected[i];
        const predIdx = predicted.indexOf(d);
        maxDisp = Math.max(maxDisp, Math.abs(predIdx - i));
    }
    if (maxDisp <= 1) minorSwaps++;
}

log('');
log(`Total failed: ${totalFailed}`);
log(`Near-misses (max displacement 1): ${minorSwaps}`);
log(`Large errors: ${totalFailed - minorSwaps}`);

// Now do a focused test: try different tempRef values on full historical set
log('');
log('=== TempRef sensitivity on historical data ===');
for (const tempRef of [20, 25, 28, 29, 30, 31, 32, 35]) {
    const p = JSON.parse(JSON.stringify(currentParams));
    p.tempRef = tempRef;
    let passed = 0;
    for (const race of races) {
        const input = { race_id: race.race_id, race_config: race.race_config, strategies: race.strategies };
        const predicted = simulate(input, p);
        if (JSON.stringify(predicted) === JSON.stringify(race.finishing_positions)) passed++;
    }
    log(`  tempRef=${tempRef}: ${passed}/1000`);
}

// Try with uniform tempCoeff
log('');
log('=== Uniform tempCoeff test ===');
for (const tc of [0.015, 0.018, 0.02, 0.022, 0.025, 0.028, 0.03]) {
    const p = JSON.parse(JSON.stringify(currentParams));
    p.tempCoeff = { SOFT: tc, MEDIUM: tc, HARD: tc };
    let passed = 0;
    for (const race of races) {
        const input = { race_id: race.race_id, race_config: race.race_config, strategies: race.strategies };
        const predicted = simulate(input, p);
        if (JSON.stringify(predicted) === JSON.stringify(race.finishing_positions)) passed++;
    }
    log(`  tempCoeff=${tc}: ${passed}/1000`);
}

// Try removing freshBonus and pitExitPenalty
log('');
log('=== Model simplification tests ===');

// No freshBonus
{
    const p = JSON.parse(JSON.stringify(currentParams));
    p.freshBonus = { SOFT: 0, MEDIUM: 0, HARD: 0 };
    p.pitExitPenalty = 0;
    let passed = 0;
    for (const race of races) {
        const input = { race_id: race.race_id, race_config: race.race_config, strategies: race.strategies };
        const predicted = simulate(input, p);
        if (JSON.stringify(predicted) === JSON.stringify(race.finishing_positions)) passed++;
    }
    log(`  No freshBonus, no pitExitPenalty: ${passed}/1000`);
}

// No shelfLife (pure degradation from lap 1)
{
    const p = JSON.parse(JSON.stringify(currentParams));
    p.shelfLife = { SOFT: 0, MEDIUM: 0, HARD: 0 };
    let passed = 0;
    for (const race of races) {
        const input = { race_id: race.race_id, race_config: race.race_config, strategies: race.strategies };
        const predicted = simulate(input, p);
        if (JSON.stringify(predicted) === JSON.stringify(race.finishing_positions)) passed++;
    }
    log(`  No shelfLife: ${passed}/1000`);
}

// Only linear degradation (no quadratic)
{
    const p = JSON.parse(JSON.stringify(currentParams));
    p.degr2 = { SOFT: 0, MEDIUM: 0, HARD: 0 };
    let passed = 0;
    for (const race of races) {
        const input = { race_id: race.race_id, race_config: race.race_config, strategies: race.strategies };
        const predicted = simulate(input, p);
        if (JSON.stringify(predicted) === JSON.stringify(race.finishing_positions)) passed++;
    }
    log(`  No quadratic degradation: ${passed}/1000`);
}

// Only quadratic (no linear)
{
    const p = JSON.parse(JSON.stringify(currentParams));
    p.degr1 = { SOFT: 0, MEDIUM: 0, HARD: 0 };
    let passed = 0;
    for (const race of races) {
        const input = { race_id: race.race_id, race_config: race.race_config, strategies: race.strategies };
        const predicted = simulate(input, p);
        if (JSON.stringify(predicted) === JSON.stringify(race.finishing_positions)) passed++;
    }
    log(`  No linear degradation (quad only): ${passed}/1000`);
}

const tmpPath = path.join(__dirname, 'analysis_result.txt');
fs.writeFileSync(tmpPath, out.join('\n'));
console.log('Analysis written to /tmp/analysis_result.txt');
console.log(out.join('\n'));
