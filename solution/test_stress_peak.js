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

function simulatePeak(race, p) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        // 0.01S GRID GAP
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: (i-1)*0.01, stops: s.pit_stops || [], si: 0 });
    }
    
    // THE FUNDAMENTAL: Wear is HIGHEST at 31 degrees
    // We use a Stress Multiplier: 1.0 - k * (Temp - 31)^2
    // If Life is SHORTER at 31, then Stress is HIGHER at 31.
    // Let stress = BaseStress + 1 / (1 + b * (Temp - 31)^2)
    const stress = 1.0 + (p.peakCoeff / (1.0 + p.peakWidth * Math.pow(temp - 31, 2)));
    
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 'SOFT' : c.tire[0] === 'M' ? 'MEDIUM' : 'HARD';
            
            // Linear Wear with the STRESS PEAK effect
            const wearRate = p.degr[ti] * stress;
            const wearEffect = Math.max(0, c.age - p.shelf[ti]) * wearRate;
            
            let lapTime = base * (1 + p.offset[ti]) + wearEffect;
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

const p = {
    degr: { SOFT: 0.12, MEDIUM: 0.06, HARD: 0.03 },
    offset: { SOFT: -0.05, MEDIUM: -0.03, HARD: -0.01 },
    shelf: { SOFT: 0, MEDIUM: 0, HARD: 0 },
    peakCoeff: 0.5,
    peakWidth: 0.05,
    freshBonus: { SOFT: -0.3, MEDIUM: -0.2, HARD: -0.1 },
    queuePenalty: 0.1
};

const cases = loadTestCases();
let ok = 0;
for (const c of cases) {
    if (JSON.stringify(simulatePeak(c.input, p)) === JSON.stringify(c.expected)) ok++;
}
console.log(`Stress Peak Model Passes: ${ok}/100`);
