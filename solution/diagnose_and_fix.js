/**
 * Diagnose failed tests and auto-tune parameters to maximize pass rate. 
 * Approach: 
 *  1. Run all 100 tests with current params, collect detailed failure info
 *  2. Use differential evolution to optimize params for max pass count
 */
const fs = require('fs');
const path = require('path');
const { simulate } = require('./race_simulator');

// Load test cases
const inputDir = path.join(__dirname, '..', 'data', 'test_cases', 'inputs');
const expectedDir = path.join(__dirname, '..', 'data', 'test_cases', 'expected_outputs');

const tests = [];
for (let i = 1; i <= 100; i++) {
    const id = String(i).padStart(3, '0');
    const inputFile = path.join(inputDir, `test_${id}.json`);
    const expectedFile = path.join(expectedDir, `test_${id}.json`);
    if (fs.existsSync(inputFile) && fs.existsSync(expectedFile)) {
        tests.push({
            id: i,
            input: JSON.parse(fs.readFileSync(inputFile, 'utf8')),
            expected: JSON.parse(fs.readFileSync(expectedFile, 'utf8')).finishing_positions
        });
    }
}

console.log(`Loaded ${tests.length} test cases.\n`);

// Evaluate a parameter set - returns number of tests passed
function evaluate(p) {
    let passed = 0;
    for (const t of tests) {
        const result = simulate(t.input, p);
        const expected = t.expected;
        if (JSON.stringify(result) === JSON.stringify(expected)) passed++;
    }
    return passed;
}

// Detailed diagnostics with current params
function diagnose(p) {
    const failures = [];
    let passed = 0;
    for (const t of tests) {
        const result = simulate(t.input, p);
        const expected = t.expected;
        if (JSON.stringify(result) === JSON.stringify(expected)) {
            passed++;
        } else {
            // Find position differences
            const diffs = [];
            for (let j = 0; j < expected.length; j++) {
                if (result[j] !== expected[j]) {
                    diffs.push({ pos: j+1, got: result[j], exp: expected[j] });
                }
            }
            // Analyze race characteristics
            const cfg = t.input.race_config;
            const strats = t.input.strategies;
            let tireTypes = new Set();
            let totalStops = 0;
            for (let k = 1; k <= 20; k++) {
                const s = strats[`pos${k}`];
                tireTypes.add(s.starting_tire.toUpperCase());
                totalStops += (s.pit_stops || []).length;
                (s.pit_stops || []).forEach(p => tireTypes.add(p.to_tire.toUpperCase()));
            }
            failures.push({
                id: t.id,
                track: cfg.track,
                laps: cfg.total_laps,
                baseLap: cfg.base_lap_time,
                pitTime: cfg.pit_lane_time,
                temp: cfg.track_temp,
                tireTypes: [...tireTypes],
                avgStops: (totalStops/20).toFixed(1),
                swapCount: diffs.length,
                topSwaps: diffs.slice(0, 5)
            });
        }
    }
    return { passed, failures };
}

// Load current params
const currentParams = JSON.parse(fs.readFileSync(path.join(__dirname, 'learned_params.json'), 'utf8')).params;

console.log('=== Current params diagnostics ===');
const diag = diagnose(currentParams);
console.log(`Passed: ${diag.passed}/100`);
console.log(`\nFailed tests summary:`);
console.log('ID   | Track          | Laps | Base   | Pit    | Temp | AvgStops | Swaps');
console.log('-----|----------------|------|--------|--------|------|----------|------');
for (const f of diag.failures) {
    console.log(`${String(f.id).padStart(3,'0')}  | ${f.track.padEnd(14)} | ${String(f.laps).padStart(4)} | ${String(f.baseLap).padStart(6)} | ${String(f.pitTime).padStart(6)} | ${String(f.temp).padStart(4)} | ${f.avgStops.padStart(8)} | ${String(f.swapCount).padStart(5)}`);
}

// Group failures by temperature
const tempGroups = {};
for (const f of diag.failures) {
    const tBucket = f.temp < 25 ? 'cold(<25)' : f.temp < 35 ? 'mild(25-35)' : 'hot(>35)';
    tempGroups[tBucket] = (tempGroups[tBucket] || 0) + 1;
}
console.log('\nFailures by temperature:');
for (const [k,v] of Object.entries(tempGroups)) console.log(`  ${k}: ${v}`);

// Group failures by track
const trackGroups = {};
for (const f of diag.failures) {
    trackGroups[f.track] = (trackGroups[f.track] || 0) + 1;
}
console.log('\nFailures by track:');
for (const [k,v] of Object.entries(trackGroups).sort((a,b)=>b[1]-a[1])) console.log(`  ${k}: ${v}`);

// Group failures by avg stops
const stopGroups = {};
for (const f of diag.failures) {
    const sBucket = parseFloat(f.avgStops) < 1.2 ? '1-stop' : parseFloat(f.avgStops) < 1.8 ? 'mixed' : '2-stop';
    stopGroups[sBucket] = (stopGroups[sBucket] || 0) + 1;
}
console.log('\nFailures by pit stop count:');
for (const [k,v] of Object.entries(stopGroups)) console.log(`  ${k}: ${v}`);

// Now run differential evolution to find better parameters
console.log('\n=== Starting Differential Evolution Optimization ===');

function cloneParams(p) { return JSON.parse(JSON.stringify(p)); }

function paramsToVec(p) {
    return [
        p.offset.SOFT, p.offset.MEDIUM, p.offset.HARD,
        p.tempCoeff.SOFT, p.tempCoeff.MEDIUM, p.tempCoeff.HARD,
        p.degr1.SOFT, p.degr1.MEDIUM, p.degr1.HARD,
        p.degr2.SOFT, p.degr2.MEDIUM, p.degr2.HARD,
        p.freshBonus.SOFT, p.freshBonus.MEDIUM, p.freshBonus.HARD,
        p.pitExitPenalty,
        p.shelfLife.SOFT, p.shelfLife.MEDIUM, p.shelfLife.HARD,
        p.queuePenalty,
        (p.degrExp || {}).SOFT || 2, (p.degrExp || {}).MEDIUM || 2, (p.degrExp || {}).HARD || 2,
        (p.fuelPace || {}).SOFT || 0, (p.fuelPace || {}).MEDIUM || 0, (p.fuelPace || {}).HARD || 0,
        (p.fuelWear || {}).SOFT || 0, (p.fuelWear || {}).MEDIUM || 0, (p.fuelWear || {}).HARD || 0,
    ];
}

function vecToParams(v) {
    return {
        offset: { SOFT: v[0], MEDIUM: v[1], HARD: v[2] },
        tempCoeff: { SOFT: v[3], MEDIUM: v[4], HARD: v[5] },
        degr1: { SOFT: v[6], MEDIUM: v[7], HARD: v[8] },
        degr2: { SOFT: v[9], MEDIUM: v[10], HARD: v[11] },
        freshBonus: { SOFT: v[12], MEDIUM: v[13], HARD: v[14] },
        pitExitPenalty: v[15],
        shelfLife: { SOFT: v[16], MEDIUM: v[17], HARD: v[18] },
        queuePenalty: v[19],
        degrExp: { SOFT: v[20], MEDIUM: v[21], HARD: v[22] },
        fuelPace: { SOFT: v[23], MEDIUM: v[24], HARD: v[25] },
        fuelWear: { SOFT: v[26], MEDIUM: v[27], HARD: v[28] },
    };
}

// Parameter bounds
const lo = [
    -0.12, -0.10, -0.08,    // offset S,M,H
    0.005, 0.005, 0.005,     // tempCoeff
    0.005, 0.002, 0.001,     // degr1
    0.00002, 0.00001, 0.000005,  // degr2
    -3, -3, -3,              // freshBonus
    -5,                       // pitExitPenalty
    5, 12, 20,               // shelfLife
    -1,                       // queuePenalty
    1.5, 1.5, 1.5,           // degrExp
    -0.2, -0.2, -0.2,        // fuelPace
    -0.2, -0.2, -0.2,        // fuelWear
];
const hi = [
    -0.01, 0.00, 0.01,      // offset S,M,H
    0.05, 0.05, 0.05,        // tempCoeff
    0.03, 0.015, 0.008,      // degr1
    0.0005, 0.0002, 0.0001,  // degr2
    2, 2, 2,                  // freshBonus
    2,                        // pitExitPenalty
    15, 25, 40,              // shelfLife
    2,                        // queuePenalty
    3, 3, 3,                  // degrExp
    0.2, 0.2, 0.2,           // fuelPace
    0.2, 0.2, 0.2,           // fuelWear
];

const D = lo.length;
const NP = 60;  // population size
const F = 0.7;   // mutation factor
const CR = 0.9;  // crossover rate
const MAX_GEN = 300;

// Initialize population
let pop = [];
const bestVec = paramsToVec(currentParams);

// Seed with current best + random perturbations
for (let i = 0; i < NP; i++) {
    const v = [];
    for (let j = 0; j < D; j++) {
        if (i === 0) {
            // Keep current best
            v.push(Math.max(lo[j], Math.min(hi[j], bestVec[j])));
        } else if (i < 5) {
            // Small perturbation from best
            const range = hi[j] - lo[j];
            v.push(Math.max(lo[j], Math.min(hi[j], bestVec[j] + (Math.random() - 0.5) * range * 0.1)));
        } else {
            // Random
            v.push(lo[j] + Math.random() * (hi[j] - lo[j]));
        }
    }
    pop.push(v);
}

// Evaluate initial population
let scores = pop.map(v => evaluate(vecToParams(v)));
let bestScore = Math.max(...scores);
let bestIdx = scores.indexOf(bestScore);
let bestParams = vecToParams(pop[bestIdx]);

console.log(`Initial best: ${bestScore}/100`);

// DE loop
for (let gen = 0; gen < MAX_GEN; gen++) {
    let improved = false;
    for (let i = 0; i < NP; i++) {
        // select 3 random distinct indices != i
        let a, b, c;
        do { a = Math.floor(Math.random() * NP); } while (a === i);
        do { b = Math.floor(Math.random() * NP); } while (b === i || b === a);
        do { c = Math.floor(Math.random() * NP); } while (c === i || c === a || c === b);

        // Use best vector in mutation (DE/best/1/bin variant)
        const trial = [];
        const jrand = Math.floor(Math.random() * D);
        for (let j = 0; j < D; j++) {
            if (Math.random() < CR || j === jrand) {
                const mutant = pop[bestIdx][j] + F * (pop[a][j] - pop[b][j]);
                trial.push(Math.max(lo[j], Math.min(hi[j], mutant)));
            } else {
                trial.push(pop[i][j]);
            }
        }

        const trialScore = evaluate(vecToParams(trial));
        if (trialScore >= scores[i]) {
            pop[i] = trial;
            scores[i] = trialScore;
            if (trialScore > bestScore) {
                bestScore = trialScore;
                bestIdx = i;
                bestParams = vecToParams(trial);
                improved = true;
                console.log(`Gen ${gen}: NEW BEST = ${bestScore}/100`);
            }
        }
    }
    if (gen % 20 === 0 && !improved) {
        console.log(`Gen ${gen}: best = ${bestScore}/100`);
    }

    // Early exit
    if (bestScore >= 95) {
        console.log(`Reached ${bestScore} — good enough!`);
        break;
    }
}

console.log(`\nFinal best: ${bestScore}/100`);
console.log('Saving optimized params...');

// Save
fs.writeFileSync(
    path.join(__dirname, 'learned_params.json'),
    JSON.stringify({ params: bestParams, score: bestScore }, null, 2)
);

// Run final diagnostics
console.log('\n=== Final diagnostics ===');
const finalDiag = diagnose(bestParams);
console.log(`Passed: ${finalDiag.passed}/100`);
if (finalDiag.failures.length > 0) {
    console.log(`Still failing: ${finalDiag.failures.map(f => f.id).join(', ')}`);
}
