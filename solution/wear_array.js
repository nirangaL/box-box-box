/**
 * WEAR ARRAY OPTIMIZER
 * Instead of assuming a functional form (quadratic, power law, shelf life),
 * we directly learn the cumulative wear for each compound at each age.
 * 
 * Lap time = base * (1 + offset + wearArray[tire][age] * tempScale)
 * 
 * Actually, let's learn total_wear_time_multiplier directly!
 * time_on_stint = base * SUM(1 + offset + wearArray[tire][age]) from age=1 to stint_length
 * time_on_stint = base * stint_length * (1 + offset) + base * cumulativeWearArray[tire][stint_length]
 * 
 * So we just learn `cumulativeWear[Tire][Age]`!
 * This is 3 * 70 = 210 linear parameters. Extremely easy to solve.
 */
const fs = require('fs');
const path = require('path');

const histDir = path.join(__dirname, '..', 'data', 'historical_races');
const racesRaw = JSON.parse(fs.readFileSync(path.join(histDir, 'races_00000-00999.json'), 'utf8'));

const NUM_RACES = 1000;
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

function extractFeatures(race) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config || race;
    const tempDelta = temp - 30;
    
    const features = {};
    for (let i = 1; i <= 20; i++) {
        const strat = race.strategies[`pos${i}`];
        const stops = strat.pit_stops || [];
        stops.sort((a,b) => a.lap - b.lap);
        
        // 216 params: 3 tires * 70 laps + 3 offsets + 3 offset_temp_coeffs
        const F = Array(216).fill(0);
        
        let curTire = strat.starting_tire.toUpperCase();
        let age = 0;
        let pitNum = 0;
        
        let offsetS = 0, offsetM = 0, offsetH = 0;
        let tempOffsetS = 0, tempOffsetM = 0, tempOffsetH = 0;
        
        for (let lap = 1; lap <= total; lap++) {
            age++;
            
            let tIdx = curTire === 'SOFT' ? 0 : curTire === 'MEDIUM' ? 1 : 2;
            
            if (curTire === 'SOFT') { offsetS++; tempOffsetS += tempDelta; }
            else if (curTire === 'MEDIUM') { offsetM++; tempOffsetM += tempDelta; }
            else { offsetH++; tempOffsetH += tempDelta; }
            
            if (age <= 70) {
                F[tIdx * 70 + (age - 1)] += base;
                // Add temp-degradation interaction? No, let's try just pure offset temp for now, 
                // Wait, wear_array assumes wear is independent of temp. I need temp as a wear multiplier!
                // Let's just solve the exact lap times since the problem is too complex for simple array?
            }
            
            if (pitNum < stops.length && lap === stops[pitNum].lap) {
                curTire = stops[pitNum].to_tire.toUpperCase();
                age = 0;
                pitNum++;
            }
        }
        
        // 210 wear, 3 offsets, 3 temp_offsets
        for(let i=0; i<3; i++) F[210+i] = [offsetS, offsetM, offsetH][i] * base;
        for(let i=0; i<3; i++) F[213+i] = [tempOffsetS, tempOffsetM, tempOffsetH][i] * base;
        features[strat.driver_id] = F;
    }
    return features;
}

function optimize() {
    console.log('Extracting features...');
    const X = [];
    const targets = [];
    
    for (const r of races) {
        const feats = extractFeatures(r);
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
                
                const pitT1 = (strat1.pit_stops || []).length * pit;
                const pitT2 = (strat2.pit_stops || []).length * pit;
                
                const f1 = feats[id1], f2 = feats[id2];
                
                if (fp[id1] < fp[id2]) {
                    X.push(f2.map((v, k) => v - f1[k]));
                    targets.push(pitT1 - pitT2); // NOT divided by base, because features are multiplied by base
                } else {
                    X.push(f1.map((v, k) => v - f2[k]));
                    targets.push(pitT2 - pitT1);
                }
            }
        }
    }
    
    console.log(`Training on ${X.length} pairwise constraints...`);
    
    let W = Array(216).fill(0);
    // Initialize offsets
    W[210] = -0.06; W[211] = -0.04; W[212] = -0.02; 
    
    const lr = 0.000000005;
    let bestErrors = X.length;
    let bestW = [...W];
    
    for (let iter = 0; iter < 5000; iter++) {
        let errors = 0;
        const grad = Array(216).fill(0);
        
        for (let k = 0; k < X.length; k++) {
            const x = X[k];
            const target = targets[k];
            const margin = target + 0.01;
            
            let dot = 0;
            for (let i = 0; i < 216; i++) dot += x[i] * W[i];
            
            if (dot < margin) {
                errors++;
                for (let i = 0; i < 216; i++) grad[i] -= x[i];
            }
        }
        
        for (let i = 0; i < 216; i++) W[i] -= lr * grad[i];
        
        // Constraints
        W[210] = Math.min(-0.01, W[210]); W[211] = Math.min(-0.01, W[211]); W[212] = Math.min(0.01, W[212]);
        
        // Wear must be monotonically increasing
        for (let t = 0; t < 3; t++) {
            W[t*70] = Math.max(0, W[t*70]); // first lap wear >= 0
            for (let a = 1; a < 70; a++) {
                // enforce monotonically increasing wear
                W[t*70 + a] = Math.max(W[t*70 + a], W[t*70 + a - 1] + 0.0001);
            }
        }
        
        if (errors < bestErrors) {
            bestErrors = errors;
            bestW = [...W];
            if (iter % 100 === 0) console.log(`Iter ${iter}: errors=${errors}/${X.length} (${(1-errors/X.length).toFixed(4)})`);
        }
        
        if (errors === 0) break;
    }
    
    console.log(`\nFinal Array Acc: ${(1-bestErrors/X.length).toFixed(4)}`);
    return bestW;
}

const W = optimize();

// Evaluate on Test Cases
let passed = 0;
for (const t of tests) {
    const feats = extractFeatures(t.input);
    const { pit_lane_time: pit } = t.input.race_config;
    
    const times = Object.keys(feats).map(id => {
        const strat = t.input.strategies[`pos${t.expected.indexOf(id)+1}`] 
                      || Object.values(t.input.strategies).find(s => s.driver_id === id);
        const pitT = (strat.pit_stops || []).length * pit;
        
        let dot = 0;
        for (let i = 0; i < 216; i++) dot += feats[id][i] * W[i];
        
        return { id, time: dot + pitT };
    });
    
    times.sort((a,b) => a.time - b.time);
    const predicted = times.map(x => x.id);
    
    if (JSON.stringify(predicted) === JSON.stringify(t.expected)) passed++;
}

console.log(`Final Test Score: ${passed}/100`);

// To make this robust, I should also extract the temperature model by adding Temp features!
// We'll save the arrays for analysis
const wearParams = {
    SOFT: Array.from(W.slice(0, 70)),
    MEDIUM: Array.from(W.slice(70, 140)),
    HARD: Array.from(W.slice(140, 210)),
    offsets: { SOFT: W[210], MEDIUM: W[211], HARD: W[212] }
};
fs.writeFileSync(path.join(__dirname, 'wear_arrays.json'), JSON.stringify(wearParams, null, 2));
