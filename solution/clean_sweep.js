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

const cases = loadTestCases();

function simulate(race, p) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: (i-1)*0.01, stops: s.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30; // 30 is base temp? or maybe 25?
    
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            const wearAge = Math.max(0, c.age - p.shelf[ti]);
            
            // Linear + Quadratic
            const wearEffect = (p.degr1[ti] * wearAge + p.degr2[ti] * wearAge * wearAge) * (1 + p.tempCoeff[ti] * tDelta);
            
            c.time += base * (1 + p.offset[ti] + wearEffect) + (c.age === 1 ? p.fresh[ti] : 0) + (c.si > 0 && c.age === 1 ? p.pitExit : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => {
            c.time += pit + q * p.qPen;
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x => x.id);
}

// baseline from DE that got 58
const p = {
    offset: { 0: -0.0575, 1: -0.0468, 2: -0.0385 },
    tempCoeff: { 0: 0.02, 1: 0.02, 2: 0.02 }, // Simplified from 0.0209, 0.023, 0.024
    degr1: { 0: 0.016, 1: 0.008, 2: 0.004 }, // Exactly 0.016, 0.008, 0.004
    degr2: { 0: 0.0001, 1: 0.00005, 2: 0.00002 }, 
    fresh: { 0: -0.75, 1: -1.0, 2: -2.0 },
    shelf: { 0: 10, 1: 20, 2: 30 },
    pitExit: -2.0,
    qPen: 0.5
};

function getScore(p) {
    let ok = 0;
    for (const c of cases) {
        if (JSON.stringify(simulate(c.input, p)) === JSON.stringify(c.expected)) ok++;
    }
    return ok;
}

console.log(`Baseline score: ${getScore(p)}`);

