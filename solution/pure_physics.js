/**
 * PURE PHYSICS OPTIMIZER
 * Uses only the exact components mentioned in the regulations:
 * 1. Base lap time
 * 2. Compound effect (speed difference)
 * 3. Tire degradation effect (after shelf life)
 * 4. Temperature effect (scales degradation)
 * 
 * NO fuel, NO grid penalty, NO driver skill, NO pit exit penalty, NO queue penalty.
 */
const fs = require('fs');
const path = require('path');

const histDir = path.join(__dirname, '..', 'data', 'historical_races');
const racesRaw = JSON.parse(fs.readFileSync(path.join(histDir, 'races_00000-00999.json'), 'utf8'));

// Use 200 races for fast training
const NUM_RACES = 200;
const trainRaces = racesRaw.slice(0, NUM_RACES);

// Prepare the data to be ultra-fast to evaluate
// We pre-calculate everything that isn't dependent on weights
// Total Time = Sum(Base) + Pits + Sum(Compound Effect) + Sum(Wear Effect)

const precomputedRaces = [];

for (const race of trainRaces) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const tempDelta = temp - 30; // Use 30 as baseline (from previous analysis)
    
    const drivers = [];
    
    for (let i = 1; i <= 20; i++) {
        const strat = race.strategies[`pos${i}`];
        const stops = strat.pit_stops || [];
        stops.sort((a,b) => a.lap - b.lap);
        
        let curTire = strat.starting_tire.toUpperCase();
        let age = 0;
        let pitNum = 0;
        
        // This object tracks how many laps were done at each (Tire, Age, TempDelta)
        const counts = {
            tires: { SOFT: 0, MEDIUM: 0, HARD: 0 },
            wearV: { SOFT: 0, MEDIUM: 0, HARD: 0 },
            wearExp: { SOFT: 0, MEDIUM: 0, HARD: 0 } // For different exponents if needed
        };
        
        const driverRace = {
            id: strat.driver_id,
            baseTime: base * total + pit * stops.length,
            laps: []
        };
        
        for (let lap = 1; lap <= total; lap++) {
            age++;
            
            driverRace.laps.push({ tire: curTire, age: age, base: base });
            
            if (pitNum < stops.length && lap === stops[pitNum].lap) {
                curTire = stops[pitNum].to_tire.toUpperCase();
                age = 0;
                pitNum++;
            }
        }
        drivers.push(driverRace);
    }
    
    // Create pair constraints: winner < loser
    const constraints = [];
    const fp = {};
    race.finishing_positions.forEach((d, i) => fp[d] = i);
    
    for (let i = 0; i < drivers.length; i++) {
        for (let j = i + 1; j < drivers.length; j++) {
            const di = drivers[i];
            const dj = drivers[j];
            if (fp[di.id] < fp[dj.id]) {
                constraints.push({ faster: di, slower: dj });
            } else {
                constraints.push({ faster: dj, slower: di });
            }
        }
    }
    
    precomputedRaces.push({
        id: race.race_id,
        drivers,
        tempDelta,
        expected: race.finishing_positions
    });
}

console.log('Precomputation done.');

function evalModel(p) {
    let exactMatches = 0;
    let inv = 0;
    
    for (const r of precomputedRaces) {
        const times = r.drivers.map(d => {
            let total = d.baseTime;
            for (const lap of d.laps) {
                const ti = lap.tire;
                const shelf = p.shelfLife[ti];
                const wearAge = Math.max(0, lap.age - shelf);
                
                const tempScale = 1 + p.tempCoeff[ti] * r.tempDelta;
                const wear = (p.degr1[ti] * wearAge + p.degr2[ti] * Math.pow(wearAge, p.degrExp[ti])) * tempScale;
                
                total += lap.base * (p.offset[ti] + wear);
            }
            return { id: d.id, time: total };
        });
        
        times.sort((a,b) => a.time - b.time);
        
        let exact = true;
        const predRanks = {};
        times.forEach((t, i) => predRanks[t.id] = i);
        
        r.expected.forEach((exId, exIdx) => {
            if (predRanks[exId] !== exIdx) exact = false;
        });
        
        if (exact) exactMatches++;
        
        // Kendall Tau calculation
        for (let i = 0; i < r.expected.length; i++) {
            for (let j = i + 1; j < r.expected.length; j++) {
                if (predRanks[r.expected[i]] > predRanks[r.expected[j]]) inv++;
            }
        }
    }
    
    return { exact: exactMatches, rankLoss: inv };
}

// Load current best
let best = JSON.parse(fs.readFileSync(path.join(__dirname, 'learned_params.json'), 'utf8')).params;
['degrExp', 'fuelPace', 'fuelWear'].forEach(key => {
    if (!best[key]) best[key] = {};
    ['SOFT', 'MEDIUM', 'HARD'].forEach(t => {
        if (best[key][t] === undefined) best[key][t] = key === 'degrExp' ? 2 : 0;
    });
});

let bestRes = evalModel(best);
console.log(`Initial: ${bestRes.exact}/${NUM_RACES} exact, loss=${bestRes.rankLoss}`);

// SA / Coordinate descent
let current = JSON.parse(JSON.stringify(best));
let currentRes = bestRes;

const paramPaths = [
    { p: ['offset', 'SOFT'], step: 0.005 },
    { p: ['offset', 'MEDIUM'], step: 0.005 },
    { p: ['offset', 'HARD'], step: 0.005 },
    { p: ['tempCoeff', 'SOFT'], step: 0.002 },
    { p: ['tempCoeff', 'MEDIUM'], step: 0.002 },
    { p: ['tempCoeff', 'HARD'], step: 0.002 },
    { p: ['degr1', 'SOFT'], step: 0.002 },
    { p: ['degr1', 'MEDIUM'], step: 0.001 },
    { p: ['degr1', 'HARD'], step: 0.0005 },
    { p: ['degr2', 'SOFT'], step: 0.00005 },
    { p: ['degr2', 'MEDIUM'], step: 0.00002 },
    { p: ['degr2', 'HARD'], step: 0.00001 },
    { p: ['shelfLife', 'SOFT'], step: 1 },
    { p: ['shelfLife', 'MEDIUM'], step: 1 },
    { p: ['shelfLife', 'HARD'], step: 1 },
    { p: ['degrExp', 'SOFT'], step: 0.1 },
    { p: ['degrExp', 'MEDIUM'], step: 0.1 },
    { p: ['degrExp', 'HARD'], step: 0.1 }
];

function getVal(p, path) {
    return p[path[0]][path[1]];
}
function setVal(p, path, val) {
    p[path[0]][path[1]] = val;
}

let iter = 0;
const maxIter = 5000;
let noImp = 0;

while (iter < maxIter && noImp < 200) {
    iter++;
    const pp = paramPaths[Math.floor(Math.random() * paramPaths.length)];
    const dir = Math.random() < 0.5 ? 1 : -1;
    const size = Math.random() * 2 * pp.step; // Random continuous step!
    
    // We can also tweak integer things like shelfLife
    const tVal = getVal(current, pp.p) + dir * size;
    
    // bounds check
    let valid = true;
    if (pp.p[0] === 'shelfLife' && (tVal < 0 || tVal > 60)) valid = false;
    if (pp.p[0] === 'degrExp' && (tVal < 1 || tVal > 3)) valid = false;
    
    if (valid) {
        const trial = JSON.parse(JSON.stringify(current));
        setVal(trial, pp.p, tVal);
        const res = evalModel(trial);
        
        // Accept if strictly better, OR accept with small probability if slightly worse (Simulated Annealing)
        // Primary obj = exact matches. Secondary obj = rank loss
        const scoreDiff = (res.exact - currentRes.exact) * 1000 - (res.rankLoss - currentRes.rankLoss);
        
        if (scoreDiff >= 0 || Math.random() < Math.exp(scoreDiff / 10)) {
            current = trial;
            currentRes = res;
            
            if ((res.exact - bestRes.exact) * 1000 - (res.rankLoss - bestRes.rankLoss) > 0) {
                best = JSON.parse(JSON.stringify(current));
                bestRes = res;
                console.log(`Iter ${iter}: ${bestRes.exact}/${NUM_RACES} exact, loss=${bestRes.rankLoss}`);
            }
            noImp = 0;
        } else {
            noImp++;
        }
    }
}

console.log(`\nBest Historical: ${bestRes.exact}/${NUM_RACES}`);
fs.writeFileSync(path.join(__dirname, 'pure_params.json'), JSON.stringify({params: best}, null, 2));

// Evaluate on 100 test cases
const inputDir = path.join(__dirname, '..', 'data', 'test_cases', 'inputs');
const expectedDir = path.join(__dirname, '..', 'data', 'test_cases', 'expected_outputs');
let testPass = 0;

for (let i = 1; i <= 100; i++) {
    const id = String(i).padStart(3, '0');
    const input = JSON.parse(fs.readFileSync(path.join(inputDir, `test_${id}.json`), 'utf8'));
    const expected = JSON.parse(fs.readFileSync(path.join(expectedDir, `test_${id}.json`), 'utf8')).finishing_positions;
    
    const { simulate } = require('./race_simulator'); 
    
    // Ensure we run the exact same simplified model for the test cases!
    // Since we didn't touch simulate(), let me write a pure simulate function here
    
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = input.race_config;
    const cars = [];
    
    for (let j = 1; j <= 20; j++) {
        const s = input.strategies[`pos${j}`];
        cars.push({ id: s.driver_id, tire: s.starting_tire.toUpperCase(), age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;
    
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire;
            const shelf = best.shelfLife[ti];
            const wearAge = Math.max(0, c.age - shelf);
            const tempScale = 1 + best.tempCoeff[ti] * tDelta;
            const wear = (best.degr1[ti] * wearAge + best.degr2[ti] * Math.pow(wearAge, best.degrExp[ti])) * tempScale;
            c.time += base * (1 + best.offset[ti] + wear);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        if (pitting.length > 0) {
            pitting.sort((a, b) => a.time - b.time); // Break ties by arrival time
            pitting.forEach(c => {
                c.time += pit;
                c.tire = c.stops[c.si].to_tire.toUpperCase();
                c.age = 0;
                c.si++;
            });
        }
    }
    const predicted = cars.sort((a,b) => a.time - b.time).map(x => x.id);
    if (JSON.stringify(predicted) === JSON.stringify(expected)) testPass++;
}

console.log(`Test score with pure model: ${testPass}/100`);
