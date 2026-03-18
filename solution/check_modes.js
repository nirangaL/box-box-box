const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', 'data', 'test_cases');
const p = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;

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

function simulate(race, mode) {
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
            const ti = c.tire[0] === 'S' ? 'SOFT' : c.tire[0] === 'M' ? 'MEDIUM' : 'HARD';
            const wearAge = Math.max(0, c.age - p.shelfLife[ti]);
            const wearEffect = (p.degr1[ti] * wearAge + p.degr2[ti] * wearAge * wearAge) * (1 + p.tempCoeff[ti] * tDelta);
            
            if (mode === 'additive') {
                c.time += base * (1 + p.offset[ti] + wearEffect)
                         + (c.age === 1 ? p.freshBonus[ti] : 0)
                         + (c.si > 0 && c.age === 1 ? p.pitExitPenalty : 0);
            } else {
                c.time += base * (1 + p.offset[ti] + wearEffect
                         + (c.age === 1 ? p.freshBonus[ti] : 0)
                         + (c.si > 0 && c.age === 1 ? p.pitExitPenalty : 0));
            }
        }
        let pitting = [];
        for (let i = 0; i < 20; i++) if (cars[i].si < cars[i].stops.length && cars[i].stops[cars[i].si].lap === lap) pitting.push(i);
        if (pitting.length > 0) {
            pitting.sort((a, b) => (cars[a].time - cars[b].time) || (cars[a].grid - cars[b].grid));
            pitting.forEach((idx, q) => {
                const c = cars[idx];
                c.time += pit + q * (p.queuePenalty || 0);
                c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
            });
        }
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x => x.id);
}

const cases = loadTestCases();
let add = 0, rel = 0;
for (const c of cases) {
    if (JSON.stringify(simulate(c.input, 'additive')) === JSON.stringify(c.expected)) add++;
    if (JSON.stringify(simulate(c.input, 'relative')) === JSON.stringify(c.expected)) rel++;
}
console.log(`Additive Score: ${add}/100`);
console.log(`Relative Score: ${rel}/100`);
