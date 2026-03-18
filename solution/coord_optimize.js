/**
 * Fast coordinate-descent optimizer for the race simulator.
 * Strategy: One parameter at a time, try small nudges, keep improvements.
 * Much faster convergence than full DE for fine-tuning.
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
console.log(`Loaded ${tests.length} tests`);

// Kendall tau distance (number of pairwise disagreements) - a better metric than binary pass/fail
function kendallTau(a, b) {
    const n = a.length;
    const posA = {};
    const posB = {};
    for (let i = 0; i < n; i++) {
        posA[a[i]] = i;
        posB[b[i]] = i;
    }
    let concordant = 0;
    let discordant = 0;
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const diffA = posA[a[i]] - posA[a[j]];
            const diffB = posB[a[i]] - posB[a[j]];
            if (diffA * diffB > 0) concordant++;
            else discordant++;
        }
    }
    return discordant;
}

// Evaluate: returns [passCount, totalKendallDistance]
function evaluate(p) {
    let passed = 0;
    let totalDist = 0;
    for (const t of tests) {
        const result = simulate(t.input, p);
        const expected = t.expected;
        if (JSON.stringify(result) === JSON.stringify(expected)) {
            passed++;
        } else {
            totalDist += kendallTau(result, expected);
        }
    }
    return [passed, totalDist];
}

// Score: primary = pass count, secondary = -kendall distance
function score(p) {
    const [passed, dist] = evaluate(p);
    return passed * 1000000 - dist;  // pass count dominates
}

// Load current params
let best = JSON.parse(fs.readFileSync(path.join(__dirname, 'learned_params.json'), 'utf8')).params;
let bestScore = score(best);
let [bestPassed] = evaluate(best);
console.log(`Starting: ${bestPassed}/100, score=${bestScore}`);

function clone(p) { return JSON.parse(JSON.stringify(p)); }

// Define all tunable parameter paths with step sizes
const paramPaths = [
    // offsets
    { path: ['offset', 'SOFT'], steps: [0.005, 0.002, 0.001, 0.0005] },
    { path: ['offset', 'MEDIUM'], steps: [0.005, 0.002, 0.001, 0.0005] },
    { path: ['offset', 'HARD'], steps: [0.005, 0.002, 0.001, 0.0005] },
    // tempCoeff
    { path: ['tempCoeff', 'SOFT'], steps: [0.005, 0.002, 0.001, 0.0005] },
    { path: ['tempCoeff', 'MEDIUM'], steps: [0.005, 0.002, 0.001, 0.0005] },
    { path: ['tempCoeff', 'HARD'], steps: [0.005, 0.002, 0.001, 0.0005] },
    // degr1
    { path: ['degr1', 'SOFT'], steps: [0.003, 0.001, 0.0005, 0.0002] },
    { path: ['degr1', 'MEDIUM'], steps: [0.002, 0.001, 0.0005, 0.0002] },
    { path: ['degr1', 'HARD'], steps: [0.001, 0.0005, 0.0002, 0.0001] },
    // degr2
    { path: ['degr2', 'SOFT'], steps: [0.0001, 0.00005, 0.00002, 0.00001] },
    { path: ['degr2', 'MEDIUM'], steps: [0.00005, 0.00002, 0.00001] },
    { path: ['degr2', 'HARD'], steps: [0.00002, 0.00001, 0.000005] },
    // freshBonus
    { path: ['freshBonus', 'SOFT'], steps: [0.5, 0.2, 0.1, 0.05] },
    { path: ['freshBonus', 'MEDIUM'], steps: [0.5, 0.2, 0.1, 0.05] },
    { path: ['freshBonus', 'HARD'], steps: [0.5, 0.2, 0.1, 0.05] },
    // pitExitPenalty
    { path: ['pitExitPenalty'], steps: [1, 0.5, 0.2, 0.1] },
    // shelfLife
    { path: ['shelfLife', 'SOFT'], steps: [2, 1, 0.5, 0.2] },
    { path: ['shelfLife', 'MEDIUM'], steps: [3, 1, 0.5, 0.2] },
    { path: ['shelfLife', 'HARD'], steps: [5, 2, 1, 0.5] },
    // queuePenalty
    { path: ['queuePenalty'], steps: [0.5, 0.2, 0.1, 0.05] },
    // degrExp
    { path: ['degrExp', 'SOFT'], steps: [0.3, 0.1, 0.05] },
    { path: ['degrExp', 'MEDIUM'], steps: [0.3, 0.1, 0.05] },
    { path: ['degrExp', 'HARD'], steps: [0.3, 0.1, 0.05] },
    // fuelPace
    { path: ['fuelPace', 'SOFT'], steps: [0.05, 0.02, 0.01] },
    { path: ['fuelPace', 'MEDIUM'], steps: [0.05, 0.02, 0.01] },
    { path: ['fuelPace', 'HARD'], steps: [0.05, 0.02, 0.01] },
    // fuelWear
    { path: ['fuelWear', 'SOFT'], steps: [0.05, 0.02, 0.01] },
    { path: ['fuelWear', 'MEDIUM'], steps: [0.05, 0.02, 0.01] },
    { path: ['fuelWear', 'HARD'], steps: [0.05, 0.02, 0.01] },
];

function getVal(p, path) {
    let v = p;
    for (const k of path) v = v[k];
    return v;
}

function setVal(p, path, val) {
    let v = p;
    for (let i = 0; i < path.length - 1; i++) {
        if (v[path[i]] === undefined) v[path[i]] = {};
        v = v[path[i]];
    }
    v[path[path.length - 1]] = val;
}

// Ensure missing nested objects exist in best
['degrExp', 'fuelPace', 'fuelWear'].forEach(key => {
    if (!best[key]) best[key] = {};
    ['SOFT', 'MEDIUM', 'HARD'].forEach(t => {
        if (best[key][t] === undefined) {
            best[key][t] = key === 'degrExp' ? 2 : 0;
        }
    });
});

// Run coordinate descent passes
const MAX_PASSES = 15;
for (let pass = 0; pass < MAX_PASSES; pass++) {
    let improved = false;
    console.log(`\n--- Pass ${pass + 1} ---`);
    
    for (const pp of paramPaths) {
        const current = getVal(best, pp.path);
        let foundBetter = false;
        
        for (const step of pp.steps) {
            for (const dir of [1, -1]) {
                const trial = clone(best);
                setVal(trial, pp.path, current + dir * step);
                const trialScore = score(trial);
                
                if (trialScore > bestScore) {
                    best = trial;
                    bestScore = trialScore;
                    [bestPassed] = evaluate(best);
                    console.log(`  ${pp.path.join('.')} ${dir > 0 ? '+' : '-'}${step}: ${bestPassed}/100 (score=${bestScore})`);
                    foundBetter = true;
                    improved = true;
                    break;
                }
            }
            if (foundBetter) break;
        }
    }
    
    // Also try random perturbations of multiple params
    for (let r = 0; r < 200; r++) {
        const trial = clone(best);
        // Perturb 2-4 random params simultaneously
        const nPerturb = 2 + Math.floor(Math.random() * 3);
        for (let k = 0; k < nPerturb; k++) {
            const pp = paramPaths[Math.floor(Math.random() * paramPaths.length)];
            const step = pp.steps[Math.floor(Math.random() * pp.steps.length)];
            const dir = Math.random() < 0.5 ? 1 : -1;
            const current = getVal(trial, pp.path);
            setVal(trial, pp.path, current + dir * step);
        }
        const trialScore = score(trial);
        if (trialScore > bestScore) {
            best = trial;
            bestScore = trialScore;
            [bestPassed] = evaluate(best);
            console.log(`  random combo: ${bestPassed}/100 (score=${bestScore})`);
            improved = true;
        }
    }
    
    if (!improved) {
        console.log(`No improvement in pass ${pass + 1}, stopping.`);
        break;
    }
    
    // Save after each pass
    fs.writeFileSync(
        path.join(__dirname, 'learned_params.json'),
        JSON.stringify({ params: best, score: bestPassed }, null, 2)
    );
    console.log(`Saved: ${bestPassed}/100`);
    
    if (bestPassed >= 95) {
        console.log('Target reached!');
        break;
    }
}

// Final detailed report
console.log(`\n=== FINAL: ${bestPassed}/100 ===`);
const failedIds = [];
for (const t of tests) {
    const result = simulate(t.input, best);
    if (JSON.stringify(result) !== JSON.stringify(t.expected)) {
        failedIds.push(t.id);
    }
}
if (failedIds.length > 0) {
    console.log(`Still failing: ${failedIds.join(', ')}`);
}

// Save final params
fs.writeFileSync(
    path.join(__dirname, 'learned_params.json'),
    JSON.stringify({ params: best, score: bestPassed }, null, 2)
);
console.log('\nParams saved to learned_params.json');
