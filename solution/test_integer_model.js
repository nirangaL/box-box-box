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

function simulateDiscrete(race, p) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
    }
    
    // THE HYPOTHESIS: Simple linear degr, small discrete steps
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            
            // Linear degr ONLY, rounded multipliers
            const deg = [p[0], p[1], p[2]][ti];
            const off = [p[3], p[4], p[5]][ti];
            
            let lapTime = base * (1 + off) + (c.age - 1) * deg;
            
            // Temperature effect (linear additive?)
            lapTime += (temp - 30) * p[6];
            
            if (c.age === 1) lapTime += p[7+ti]; // Fresh Bonus
            
            c.time += Math.round(lapTime * 10) / 10;
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => {
            c.time += pit + p[10] + q * p[11];
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x => x.id);
}

const cases = loadTestCases();
console.log('Testing Integer-Model (Linear Degr, 1-decimal rounding)...');

// Search for coarse but effective parameters
const variants = [
    [0.1, 0.05, 0.02, -0.01, 0.0, 0.01, 0.05, -0.5, -0.3, -0.1, 2.0, 0.5],
    [0.12, 0.06, 0.03, -0.015, 0.0, 0.015, 0.06, -0.6, -0.4, -0.2, 2.5, 0.6],
    [0.15, 0.08, 0.04, -0.02, 0.0, 0.02, 0.08, -0.8, -0.5, -0.2, 3.0, 0.8]
];

variants.forEach((v, i) => {
    let ok = 0;
    for (const c of cases) if (JSON.stringify(simulateDiscrete(c.input, v)) === JSON.stringify(c.expected)) ok++;
    console.log(`Variant ${i}: ${ok}/100`);
});
