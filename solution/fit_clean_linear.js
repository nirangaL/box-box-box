const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', 'data', 'test_cases');
function loadTestCases() {
    const cases = [];
    for (let i = 1; i <= 100; i++) {
        const id = String(i).padStart(3, '0');
        const input = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'inputs', `test_${id}.json`), 'utf8'));
        const output = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'expected_outputs', `test_${id}.json`), 'utf8'));
        cases.push({ input, expected: output.finishing_positions });
    }
    return cases;
}

function simulateLinear(race, p) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        // THE FUNDAMENTAL: 0.01S GRID GAP
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: (i-1)*0.01, stops: s.pit_stops || [], si: 0 });
    }
    
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 'SOFT' : c.tire[0] === 'M' ? 'MEDIUM' : 'HARD';
            
            // PURE LINEAR DEGRADATION
            const wearRate = p.degr[ti];
            const wearEffect = Math.max(0, c.age - p.shelf[ti]) * wearRate;
            
            // THE PACE OFFSET
            const offset = p.offset[ti];
            
            // TEMPERATURE EFFECT (Linear additive)
            const tempEffect = (temp - 30) * p.tempCoeff;
            
            let lapTime = base * (1 + offset) + wearEffect + tempEffect;
            
            // FRESH BONUS
            if (c.age === 1) lapTime += p.freshBonus[ti];
            
            c.time += lapTime;
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => {
            c.time += pit + q * p.queuePenalty;
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x => x.id);
}

const cases = loadTestCases();

// Sweep through "Nice" values
const p = {
    degr: { SOFT: 0.08, MEDIUM: 0.04, HARD: 0.02 },
    offset: { SOFT: -0.04, MEDIUM: -0.02, HARD: 0.0 }, // Relative to base
    shelf: { SOFT: 0, MEDIUM: 0, HARD: 0 },
    tempCoeff: 0.01,
    freshBonus: { SOFT: -0.3, MEDIUM: -0.2, HARD: -0.1 },
    queuePenalty: 0.5
};

console.log('Testing "Clean Linear Fundamental"...');
let match = 0;
for (const c of cases) {
    const pred = simulateLinear(c.input, p);
    if (JSON.stringify(pred) === JSON.stringify(c.expected)) match++;
}
console.log(`Initial Match: ${match}/100`);

// Genetic/Hill climb search for the CLEAN coefficients
async function search() {
    let currentBest = p;
    let rank = match;
    for (let i = 0; i < 5000; i++) {
        const next = JSON.parse(JSON.stringify(currentBest));
        // Use discrete steps
        const coin = Math.random();
        if (coin < 0.2) next.degr.SOFT += (Math.random() < 0.5 ? 0.005 : -0.005);
        else if (coin < 0.4) next.degr.MEDIUM += (Math.random() < 0.5 ? 0.005 : -0.005);
        else if (coin < 0.6) next.offset.SOFT += (Math.random() < 0.5 ? 0.005 : -0.005);
        else if (coin < 0.8) next.offset.MEDIUM += (Math.random() < 0.5 ? 0.005 : -0.005);
        else next.tempCoeff += (Math.random() < 0.5 ? 0.001 : -0.001);
        
        let ok = 0;
        for (const c of cases) if (JSON.stringify(simulateLinear(c.input, next)) === JSON.stringify(c.expected)) ok++;
        if (ok >= rank) {
            rank = ok;
            currentBest = next;
            if (i % 50 === 0) console.log(`Step ${i}: ${rank}/100`);
            if (rank >= 90) break;
        }
    }
    console.log('Best Clean Parameters:', JSON.stringify(currentBest, null, 2));
}

search();
