/**
 * EXACT LINEAR SOLVER
 * Formulates the F1 race as a linear pairwise ranking problem.
 * 
 * Lap time = base * (1 + offset + wear_effect)
 * wear_effect = (d1 * age + d2 * age^2) * (1 + tc * delta_T)
 *             = d1 * age + d1_tc * age * delta_T + d2 * age^2 + d2_tc * age^2 * delta_T
 *
 * This means Time = base * V · W
 * Where V is a feature vector and W are the weights.
 * Since V · W is linear, we can find W perfectly if we know the shelf lives.
 */
const fs = require('fs');
const path = require('path');

const histDir = path.join(__dirname, '..', 'data', 'historical_races');
const racesRaw = JSON.parse(fs.readFileSync(path.join(histDir, 'races_00000-00999.json'), 'utf8'));

// Use a rich sample of races (temp differences, tire differences)
const NUM_RACES = 500;
const races = racesRaw.slice(0, NUM_RACES);
const tests = [];
const testDir = path.join(__dirname, '..', 'data', 'test_cases');
for (let i = 1; i <= 100; i++) {
    const id = String(i).padStart(3, '0');
    tests.push({
        input: JSON.parse(fs.readFileSync(path.join(testDir, 'inputs', `test_${id}.json`), 'utf8')),
        expected: JSON.parse(fs.readFileSync(path.join(testDir, 'expected_outputs', `test_${id}.json`), 'utf8')).finishing_positions
    });
}

// 12 linear parameters to find
// offset (S, M, H) = 3
// degr1_base (S, M, H) = 3
// degr1_temp (S, M, H) = 3
// degr2_base (S, M, H) = 3
// degr2_temp (S, M, H) = 3
// Total 15 features

function extractFeatures(race, shelfS, shelfM, shelfH) {
    const { base_lap_time: base, track_temp: temp, total_laps: total } = race.race_config || race;
    const tempDelta = temp - 30;
    const shelf = { SOFT: shelfS, MEDIUM: shelfM, HARD: shelfH };
    
    const features = {};
    for (let i = 1; i <= 20; i++) {
        const strat = race.strategies[`pos${i}`];
        const stops = strat.pit_stops || [];
        stops.sort((a,b) => a.lap - b.lap);
        
        let curTire = strat.starting_tire.toUpperCase();
        let age = 0;
        let pitNum = 0;
        
        let lapsS=0, lapsM=0, lapsH=0;
        let d1bS=0, d1bM=0, d1bH=0;
        let d2bS=0, d2bM=0, d2bH=0;
        let d1tS=0, d1tM=0, d1tH=0;
        let d2tS=0, d2tM=0, d2tH=0;
        
        for (let lap = 1; lap <= total; lap++) {
            age++;
            const wearAge = Math.max(0, age - shelf[curTire]);
            const a1 = wearAge;
            const a2 = wearAge * wearAge; // Assuming degrExp = 2
            
            if (curTire === 'SOFT') { lapsS++; d1bS+=a1; d2bS+=a2; d1tS+=a1*tempDelta; d2tS+=a2*tempDelta; }
            if (curTire === 'MEDIUM') { lapsM++; d1bM+=a1; d2bM+=a2; d1tM+=a1*tempDelta; d2tM+=a2*tempDelta; }
            if (curTire === 'HARD') { lapsH++; d1bH+=a1; d2bH+=a2; d1tH+=a1*tempDelta; d2tH+=a2*tempDelta; }
            
            if (pitNum < stops.length && lap === stops[pitNum].lap) {
                curTire = stops[pitNum].to_tire.toUpperCase();
                age = 0;
                pitNum++;
            }
        }
        
        features[strat.driver_id] = [
            lapsS, lapsM, lapsH, 
            d1bS, d1bM, d1bH, 
            d1tS, d1tM, d1tH,
            d2bS, d2bM, d2bH, 
            d2tS, d2tM, d2tH
        ].map(v => v * base); // Multiply by base since T = base * (offset + wear)
    }
    return features;
}

    // Optimization routine for a fixed set of shelf lives
function optimizeWeights(shelfS, shelfM, shelfH) {
    const X = [];
    const targets = [];
    
    for (const r of races) {
        const feats = extractFeatures(r, shelfS, shelfM, shelfH);
        const fp = {};
        r.finishing_positions.forEach((d, i) => fp[d] = i);
        
        const ids = Object.keys(feats);
        const { pit_lane_time: pit, base_lap_time: base } = r.race_config;
        
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const id1 = ids[i], id2 = ids[j];
                const strat1 = r.strategies[`pos${r.finishing_positions.indexOf(id1)+1}`] 
                               || Object.values(r.strategies).find(s => s.driver_id === id1);
                const strat2 = r.strategies[`pos${r.finishing_positions.indexOf(id2)+1}`]
                               || Object.values(r.strategies).find(s => s.driver_id === id2);
                
                const pitLaps1 = (strat1.pit_stops || []).length;
                const pitLaps2 = (strat2.pit_stops || []).length;
                const pitT1 = pitLaps1 * pit;
                const pitT2 = pitLaps2 * pit;
                
                const f1 = feats[id1], f2 = feats[id2];
                // Time = Base * W * V + PitTime
                // if id1 wins: Base * W * f1 + pitT1 < Base * W * f2 + pitT2
                // Base * W * (f2 - f1) > pitT1 - pitT2
                // W * (f2 - f1) > (pitT1 - pitT2) / Base
                
                if (fp[id1] < fp[id2]) {
                    X.push(f2.map((v, k) => v - f1[k]));
                    targets.push((pitT1 - pitT2) / base);
                } else {
                    X.push(f1.map((v, k) => v - f2[k]));
                    targets.push((pitT2 - pitT1) / base);
                }
            }
        }
    }
    
    let W = Array(15).fill(0);
    // Initialize offsets
    W[0] = -0.06; W[1] = -0.04; W[2] = -0.02; 
    
    const lr = 0.00000001;
    let bestErrors = X.length;
    let bestW = [...W];
    
    for (let iter = 0; iter < 5000; iter++) {
        let errors = 0;
        const grad = Array(15).fill(0);
        
        for (let k = 0; k < X.length; k++) {
            const x = X[k];
            const target = targets[k];
            const margin = target + 0.001; // Need strict inequality
            
            let dot = 0;
            for (let i = 0; i < 15; i++) dot += x[i] * W[i];
            
            if (dot < margin) {
                errors++;
                for (let i = 0; i < 15; i++) grad[i] -= x[i];
            }
        }
        
        for (let i = 0; i < 15; i++) {
            W[i] -= lr * grad[i];
        }
        
        // Enforce physical constraints:
        W[0] = Math.min(-0.01, W[0]); W[1] = Math.min(-0.01, W[1]); W[2] = Math.min(0.01, W[2]);
        for (let i = 3; i < 6; i++) W[i] = Math.max(0.001, W[i]); 
        for (let i = 9; i < 12; i++) W[i] = Math.max(0.000001, W[i]); 
        
        if (errors < bestErrors) {
            bestErrors = errors;
            bestW = [...W];
        }
        
        if (errors === 0) break;
    }
    
    const acc = 1 - (bestErrors / X.length);
    return { acc, w: bestW, errors: bestErrors, total: X.length };
}

console.log('--- Starting Exact Linear Solver ---');
console.log('Sweeping shelfLife combinations...');

let bestGlobalAcc = 0;
let bestGlobalCfg = null;

// Grid search shelf lives
const candS = [8, 10, 12, 14];
const candM = [15, 18, 20, 22]; 
const candH = [25, 28, 30, 32];

let totalCombos = candS.length * candM.length * candH.length;
let i = 0;

for (const s of candS) {
    for (const m of candM) {
        for (const h of candH) {
            i++;
            if (i % 10 === 0) process.stdout.write(`\rTesting ${i}/${totalCombos}...`);
            const res = optimizeWeights(s, m, h);
            
            if (res.acc > bestGlobalAcc) {
                bestGlobalAcc = res.acc;
                bestGlobalCfg = { s, m, h, w: res.w, res };
                console.log(`\n  NEW BEST: shelf=(${s},${m},${h}) | Pairs Acc: ${(res.acc*100).toFixed(2)}% | errs=${res.errors}/${res.total}`);
            }
        }
    }
}

console.log(`\nBest Acc: ${(bestGlobalAcc*100).toFixed(2)}%`);
console.log('Best Params:', bestGlobalCfg);

// Evaluate on 100 test cases using the recovered model
function evalOnTests(shelf, w) {
    let passed = 0;
    for (const t of tests) {
        const feats = extractFeatures(t.input, shelf.s, shelf.m, shelf.h);
        
        const times = Object.keys(feats).map(id => {
            const f = feats[id];
            let dot = 0;
            for (let j = 0; j < 15; j++) dot += f[j] * w[j];
            return { id, time: dot };
        });
        
        times.sort((a,b) => a.time - b.time);
        const predicted = times.map(x => x.id);
        
        if (JSON.stringify(predicted) === JSON.stringify(t.expected)) passed++;
    }
    return passed;
}

const testScore = evalOnTests(bestGlobalCfg, bestGlobalCfg.w);
console.log(`Final Test Score: ${testScore}/100`);

// Write params map for export
const W = bestGlobalCfg.w;
const extractedParams = {
    offset: { SOFT: W[0], MEDIUM: W[1], HARD: W[2] },
    tempCoeff: { 
        SOFT: W[6] / W[3],   // d1t / d1b ≈ tc
        MEDIUM: W[7] / W[4], 
        HARD: W[8] / W[5] 
    },
    degr1: { SOFT: W[3], MEDIUM: W[4], HARD: W[5] },
    degr2: { SOFT: W[9], MEDIUM: W[10], HARD: W[11] },
    shelfLife: { SOFT: bestGlobalCfg.s, MEDIUM: bestGlobalCfg.m, HARD: bestGlobalCfg.h },
    degrExp: { SOFT: 2, MEDIUM: 2, HARD: 2 },
    queuePenalty: 0,
    pitExitPenalty: 0,
    freshBonus: { SOFT: 0, MEDIUM: 0, HARD: 0 }
};

fs.writeFileSync(path.join(__dirname, 'linear_extracted.json'), JSON.stringify({params: extractedParams}, null, 2));
console.log('Extracted params saved to linear_extracted.json');
