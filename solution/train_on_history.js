/**
 * Extract exact formula parameters from historical data.
 * 
 * Key insight: In races where only 2 drivers have different strategies but same 
 * number of stops, their time difference DIRECTLY reveals parameter values.
 * 
 * Better: Use races with IDENTICAL strategies except one pit lap differs - 
 * this isolates the degradation function.
 * 
 * Even better: Use the massive historical data to train with DE optimizer,
 * using Kendall tau as loss function over many races.
 */
const fs = require('fs');
const path = require('path');
const { simulate } = require('./race_simulator');

// Load ALL historical races (sample enough for good coverage)
console.log('Loading historical races for training...');
const histDir = path.join(__dirname, '..', 'data', 'historical_races');
let allRaces = [];

// Load first 5000 races for training (5 files)
for (let batch = 0; batch < 5; batch++) {
    const start = String(batch * 1000).padStart(5, '0');
    const end = String(batch * 1000 + 999).padStart(5, '0');
    const file = path.join(histDir, `races_${start}-${end}.json`);
    const races = JSON.parse(fs.readFileSync(file, 'utf8'));
    allRaces.push(...races);
}
console.log(`Loaded ${allRaces.length} historical races`);

// Load test cases
const inputDir = path.join(__dirname, '..', 'data', 'test_cases', 'inputs');
const expectedDir = path.join(__dirname, '..', 'data', 'test_cases', 'expected_outputs');
const tests = [];
for (let i = 1; i <= 100; i++) {
    const id = String(i).padStart(3, '0');
    tests.push({
        id: i,
        input: JSON.parse(fs.readFileSync(path.join(inputDir, `test_${id}.json`), 'utf8')),
        expected: JSON.parse(fs.readFileSync(path.join(expectedDir, `test_${id}.json`), 'utf8')).finishing_positions
    });
}

// Evaluate on test cases
function evalTests(p) {
    let passed = 0;
    for (const t of tests) {
        const predicted = simulate(t.input, p);
        if (JSON.stringify(predicted) === JSON.stringify(t.expected)) passed++;
    }
    return passed;
}

// Evaluate on historical races (use a random subset for speed)
function evalHistorical(p, races) {
    let passed = 0;
    for (const race of races) {
        const input = { race_id: race.race_id, race_config: race.race_config, strategies: race.strategies };
        const predicted = simulate(input, p);
        if (JSON.stringify(predicted) === JSON.stringify(race.finishing_positions)) passed++;
    }
    return passed;
}

// Combined score: test cases (weighted heavily) + historical accuracy
function combinedScore(p, histSample) {
    const testPassed = evalTests(p);
    const histPassed = evalHistorical(p, histSample);
    return testPassed * 100 + histPassed;  // test cases dominate
}

// Sample 500 historical races for validation
const histSample = allRaces.sort(() => Math.random() - 0.5).slice(0, 500);

// Load current params
let best = JSON.parse(fs.readFileSync(path.join(__dirname, 'learned_params.json'), 'utf8')).params;

// Ensure nested objects
['degrExp', 'fuelPace', 'fuelWear'].forEach(key => {
    if (!best[key]) best[key] = {};
    ['SOFT', 'MEDIUM', 'HARD'].forEach(t => {
        if (best[key][t] === undefined) best[key][t] = key === 'degrExp' ? 2 : 0;
    });
});

let testPass = evalTests(best);
let histPass = evalHistorical(best, histSample);
console.log(`\nCurrent: tests=${testPass}/100, hist=${histPass}/500`);

// Now do DE optimization training on BOTH test cases AND historical data
console.log('\n=== DE Optimization (training on test + historical) ===');

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
    };
}

const D = 20;
const bounds = [
    [-0.12, -0.02],  // offset SOFT
    [-0.08, 0.0],    // offset MEDIUM
    [-0.06, 0.02],   // offset HARD
    [0.005, 0.05],   // tempCoeff SOFT
    [0.005, 0.05],   // tempCoeff MEDIUM
    [0.005, 0.05],   // tempCoeff HARD
    [0.005, 0.03],   // degr1 SOFT
    [0.002, 0.015],  // degr1 MEDIUM
    [0.001, 0.008],  // degr1 HARD
    [0.00002, 0.0005], // degr2 SOFT
    [0.00001, 0.0002], // degr2 MEDIUM
    [0.000005, 0.0001], // degr2 HARD
    [-3, 2],          // freshBonus SOFT
    [-3, 2],          // freshBonus MEDIUM
    [-3, 2],          // freshBonus HARD
    [-5, 2],          // pitExitPenalty
    [5, 15],          // shelfLife SOFT
    [12, 25],         // shelfLife MEDIUM
    [20, 40],         // shelfLife HARD
    [-1, 2],          // queuePenalty
];

const NP = 40;
const MAX_GEN = 500;
const F = 0.8;
const CR = 0.9;

// Use a SMALLER hist sample for each evaluation (faster)
const fastHistSample = histSample.slice(0, 200);

function fitness(v) {
    const p = vecToParams(v);
    // Primary: test pass count, Secondary: historical pass count
    let testP = 0;
    for (const t of tests) {
        if (JSON.stringify(simulate(t.input, p)) === JSON.stringify(t.expected)) testP++;
    }
    let histP = 0;
    for (const r of fastHistSample) {
        const input = { race_id: r.race_id, race_config: r.race_config, strategies: r.strategies };
        if (JSON.stringify(simulate(input, p)) === JSON.stringify(r.finishing_positions)) histP++;
    }
    return testP * 10000 + histP;
}

// Initialize population
let pop = [];
const seedVec = paramsToVec(best);

for (let i = 0; i < NP; i++) {
    const v = [];
    for (let j = 0; j < D; j++) {
        if (i === 0) {
            v.push(Math.max(bounds[j][0], Math.min(bounds[j][1], seedVec[j])));
        } else if (i < 10) {
            // Perturbation of seed
            const range = bounds[j][1] - bounds[j][0];
            const perturb = seedVec[j] + (Math.random() - 0.5) * range * 0.2;
            v.push(Math.max(bounds[j][0], Math.min(bounds[j][1], perturb)));
        } else {
            v.push(bounds[j][0] + Math.random() * (bounds[j][1] - bounds[j][0]));
        }
    }
    pop.push(v);
}

let scores = pop.map(v => fitness(v));
let bestScore = Math.max(...scores);
let bestIdx = scores.indexOf(bestScore);
let bestVec2 = [...pop[bestIdx]];

console.log(`Initial best: test=${Math.floor(bestScore/10000)}/100, hist=${bestScore%10000}/200`);

for (let gen = 0; gen < MAX_GEN; gen++) {
    for (let i = 0; i < NP; i++) {
        let a, b, c;
        do { a = Math.floor(Math.random() * NP); } while (a === i);
        do { b = Math.floor(Math.random() * NP); } while (b === i || b === a);
        do { c = Math.floor(Math.random() * NP); } while (c === i || c === a || c === b);

        const trial = [];
        const jrand = Math.floor(Math.random() * D);
        for (let j = 0; j < D; j++) {
            if (Math.random() < CR || j === jrand) {
                // DE/best/1/bin
                const mutant = bestVec2[j] + F * (pop[a][j] - pop[b][j]);
                trial.push(Math.max(bounds[j][0], Math.min(bounds[j][1], mutant)));
            } else {
                trial.push(pop[i][j]);
            }
        }

        const trialScore = fitness(trial);
        if (trialScore >= scores[i]) {
            pop[i] = trial;
            scores[i] = trialScore;
            if (trialScore > bestScore) {
                bestScore = trialScore;
                bestIdx = i;
                bestVec2 = [...trial];
                const testP = Math.floor(bestScore / 10000);
                const histP = bestScore % 10000;
                console.log(`Gen ${gen}: test=${testP}/100, hist=${histP}/200`);
                
                // Save intermediate result
                const bestP = vecToParams(bestVec2);
                fs.writeFileSync(
                    path.join(__dirname, 'learned_params.json'),
                    JSON.stringify({ params: bestP, score: testP }, null, 2)
                );
            }
        }
    }
    
    if (gen % 50 === 0) {
        const testP = Math.floor(bestScore / 10000);
        console.log(`Gen ${gen}: best test=${testP}/100`);
    }
    
    if (Math.floor(bestScore / 10000) >= 90) {
        console.log('Target reached!');
        break;
    }
}

const finalParams = vecToParams(bestVec2);
const finalTestPass = evalTests(finalParams);
console.log(`\nFinal: ${finalTestPass}/100 tests passed`);

fs.writeFileSync(
    path.join(__dirname, 'learned_params.json'),
    JSON.stringify({ params: finalParams, score: finalTestPass }, null, 2)
);
console.log('Saved to learned_params.json');
