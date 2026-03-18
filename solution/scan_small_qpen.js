const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', 'data', 'test_cases');
const best = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;

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

function simulate(race, qPen) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
    }
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 'SOFT' : c.tire[0] === 'M' ? 'MEDIUM' : 'HARD';
            const wearAge = Math.max(0, c.age - best.shelfLife[ti]);
            const wearEffect = (best.degr1[ti] * wearAge + best.degr2[ti] * wearAge * wearAge) * (1 + best.tempCoeff[ti] * (temp - 30));
            c.time += base * (1 + best.offset[ti] + wearEffect) + (c.age === 1 ? best.freshBonus[ti] : 0) + (c.si > 0 && c.age === 1 ? best.pitExitPenalty : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => {
            c.time += pit + q * qPen;
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x => x.id);
}

const cases = loadTestCases();
console.log('Scanning for small qPen...');
for (let q = 0; q <= 0.1; q += 0.005) {
    let ok = 0;
    for (const c of cases) {
        if (JSON.stringify(simulate(c.input, q)) === JSON.stringify(c.expected)) ok++;
    }
    console.log(`qPen ${q.toFixed(3)}: ${ok}/100`);
}
