const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', 'data', 'test_cases');
function loadTestCases() {
    const cases = [];
    for (let i = 1; i <= 100; i++) {
        const id = String(i).padStart(3, '0');
        const input = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'inputs', `test_${id}.json`), 'utf8'));
        const output = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'expected_outputs', `test_${id}.json`), 'utf8'));
        cases.push({
            input,
            expected: output.finishing_positions,
            expectedMap: output.finishing_positions.reduce((acc, id, rank) => { acc[id] = rank; return acc; }, {})
        });
    }
    return cases;
}

// Model A: Current model (multiplicative base, shelf + quadratic wear, temp scales wear)
function simA(race, p) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            const wearAge = Math.max(0, c.age - p[16+ti]);
            const wearEffect = (p[6+ti]*wearAge + p[9+ti]*wearAge*wearAge) * (1 + p[3+ti]*tDelta);
            c.time += base * (1 + p[ti] + wearEffect) + (c.age === 1 ? p[12+ti] : 0) + (c.si > 0 && c.age === 1 ? p[15] : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time-b.time) || (a.grid-b.grid));
        pitting.forEach((c, q) => {
            c.time += pit + q * p[19];
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time-b.time) || (a.grid-b.grid)).map(x=>x.id);
}

// Model B: Additive base (NOT multiplied by base_lap_time for wear/offset), temp affects degradation rate directly
function simB(race, p) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            // Additive wear: base + offset + degr * age + temp_effect * age
            const degradation = (p[6+ti] + p[3+ti] * tDelta) * c.age;
            c.time += base + p[ti] + degradation + (c.age === 1 ? p[12+ti] : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time-b.time) || (a.grid-b.grid));
        pitting.forEach((c, q) => {
            c.time += pit;
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time-b.time) || (a.grid-b.grid)).map(x=>x.id);
}

// Model C: Like B but with temp affecting the compound OFFSET (grip) not degradation
function simC(race, p) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            // Temp affects PACE offset, not degradation
            const paceOffset = p[ti] + p[3+ti] * tDelta;
            const degradation = p[6+ti] * c.age;
            c.time += base + paceOffset + degradation + (c.age === 1 ? p[12+ti] : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time-b.time) || (a.grid-b.grid));
        pitting.forEach((c, q) => {
            c.time += pit;
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time-b.time) || (a.grid-b.grid)).map(x=>x.id);
}

function score(cases, simFn, p) {
    let exact = 0, pairs = 0;
    for (const c of cases) {
        const pred = simFn(c.input, p);
        if (JSON.stringify(pred) === JSON.stringify(c.expected)) {
            exact++;
            pairs += 190;
        } else {
            for (let i = 0; i < 20; i++) {
                const ri = c.expectedMap[pred[i]];
                for (let j = i + 1; j < 20; j++) if (ri < c.expectedMap[pred[j]]) pairs++;
            }
        }
    }
    return exact * 1000000 + pairs;
}

const cases = loadTestCases();

// --- Test Model B (additive, no base multiplier for wear) ---
function deOptimize(simFn, ranges, label) {
    const popSize = 60;
    let pop = Array.from({length: popSize}, () => ranges.map(r => r[0] + Math.random()*(r[1]-r[0])));
    
    // Seed with known baseline
    try {
        const s = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;
        pop[0] = [s.offset.SOFT, s.offset.MEDIUM, s.offset.HARD,
                  s.tempCoeff.SOFT, s.tempCoeff.MEDIUM, s.tempCoeff.HARD,
                  s.degr1.SOFT, s.degr1.MEDIUM, s.degr1.HARD,
                  s.degr2.SOFT, s.degr2.MEDIUM, s.degr2.HARD,
                  s.freshBonus.SOFT, s.freshBonus.MEDIUM, s.freshBonus.HARD,
                  s.pitExitPenalty,
                  s.shelfLife.SOFT, s.shelfLife.MEDIUM, s.shelfLife.HARD,
                  s.queuePenalty || 0];
    } catch(e){}
    
    let scores = pop.map(p => score(cases, simFn, p));
    let bestIdx = scores.indexOf(Math.max(...scores));
    console.log(`[${label}] Initial: ${Math.floor(scores[bestIdx]/1000000)}/100`);
    
    for (let gen = 0; gen < 1500; gen++) {
        for (let i = 0; i < popSize; i++) {
            let a,b,c; 
            do{a=Math.floor(Math.random()*popSize);}while(a===i);
            do{b=Math.floor(Math.random()*popSize);}while(b===i||b===a);
            do{c=Math.floor(Math.random()*popSize);}while(c===i||c===a||c===b);
            const mutant = pop[a].map((val, idx) => {
                if (Math.random() < 0.9) {
                    let v = val + 0.8 * (pop[b][idx] - pop[c][idx]);
                    return Math.max(ranges[idx][0], Math.min(ranges[idx][1], v));
                }
                return pop[i][idx];
            });
            const s = score(cases, simFn, mutant);
            if (s >= scores[i]) {
                pop[i] = mutant; scores[i] = s;
                if (s > scores[bestIdx]) {
                    bestIdx = i;
                    const exact = Math.floor(s/1000000);
                    console.log(`[${label}] Gen ${gen}: ${exact}/100 (pairs=${s%1000000})`);
                }
            }
        }
    }
    const best = Math.floor(scores[bestIdx]/1000000);
    console.log(`[${label}] FINAL: ${best}/100\n`);
    return { score: scores[bestIdx], params: pop[bestIdx] };
}

// Model B ranges (additive)
const rangesB = [
    [-5, 0], [-3, 0], [-2, 0],             // offset (additive seconds)
    [0, 0.1], [0, 0.1], [0, 0.1],          // tempCoeff on degradation
    [0, 0.5], [0, 0.3], [0, 0.1],          // degradation per lap
    [0, 0], [0, 0], [0, 0],                // unused
    [-3, 1], [-3, 1], [-3, 1],             // freshBonus
    [0, 0], [0, 0], [0, 0], [0, 0], [0, 0] // unused
];

// Model C ranges (temp affects pace)
const rangesC = [
    [-5, 0], [-3, 0], [-2, 0],             // offset
    [-0.2, 0.2], [-0.2, 0.2], [-0.2, 0.2], // tempCoeff on PACE
    [0, 0.5], [0, 0.3], [0, 0.1],          // degradation per lap
    [0, 0], [0, 0], [0, 0],                // unused
    [-3, 1], [-3, 1], [-3, 1],             // freshBonus
    [0, 0], [0, 0], [0, 0], [0, 0], [0, 0] // unused
];

// Model A ranges (current, but with HARD tempCoeff properly constrained)
const rangesA = [
    [-0.1, 0.1], [-0.1, 0.1], [-0.1, 0.1], // offsets
    [0, 0.1], [0, 0.1], [0, 0.1],           // tempCoeff (ALL constrained)
    [0, 0.05], [0, 0.05], [0, 0.05],        // d1
    [0, 0.005], [0, 0.005], [0, 0.005],     // d2
    [-2, 2], [-2, 2], [-2, 2],              // freshBonus
    [-3, 3],                                 // pitExitPenalty
    [0, 20], [5, 40], [10, 60],             // shelfLife
    [0, 1.0]                                 // queuePenalty
];

console.log('=== Testing 3 Formula Structures ===\n');
const rA = deOptimize(simA, rangesA, 'Model-A (multiplicative)');
const rB = deOptimize(simB, rangesB, 'Model-B (additive+tempDeg)');
const rC = deOptimize(simC, rangesC, 'Model-C (additive+tempPace)');

console.log('\n=== RESULTS ===');
console.log(`Model A: ${Math.floor(rA.score/1000000)}/100`);
console.log(`Model B: ${Math.floor(rB.score/1000000)}/100`);
console.log(`Model C: ${Math.floor(rC.score/1000000)}/100`);

const winner = [rA, rB, rC].sort((a,b) => b.score - a.score)[0];
console.log(`\nBest Model Params: [${winner.params.map(x=>x.toFixed(6)).join(', ')}]`);
