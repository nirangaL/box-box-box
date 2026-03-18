const fs = require('fs');
const path = require('path');

const TEST_DIR = 'data/test_cases';
function loadCases(ids) {
    return ids.map(id => {
        const sid = String(id).padStart(3, '0');
        const i = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'inputs', `test_${sid}.json`), 'utf8'));
        const e = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'expected_outputs', `test_${sid}.json`), 'utf8')).finishing_positions;
        return { i, e };
    });
}

function simulate(p, race) {
    const rc = race.race_config, base = rc.base_lap_time, temp = rc.track_temp, pit = rc.pit_lane_time, total = rc.total_laps;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: (i-1)*0.01, stops: s.pit_stops || [], si: 0 });
    }
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            const wearAge = Math.max(0, c.age - p.shelf[ti]);
            c.time += base * (1 + p.offset[ti]) + p.wear[ti] * wearAge;
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b)=>(a.time-b.time) || (a.grid-b.grid));
        pitting.forEach((c, q) => {
            c.time += pit + q * 0.1;
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b)=>(a.time-b.time) || (a.grid-b.grid)).map(x => x.id);
}

const p = { shelf: [13, 23, 34], wear: [0.1, 0.05, 0.02], offset: [-0.05, -0.03, -0.01] };
const cases = loadCases([1, 5, 8, 10, 16]); // Representative subset

console.log('Sub-case Grid Search...');

for (let os = -0.1; os <= 0.02; os += 0.01) {
    for (let ws = 0.01; ws <= 0.2; ws += 0.02) {
        p.offset[0] = os; p.wear[0] = ws;
        let score = 0;
        for (const c of cases) {
            const pred = simulate(p, c.i);
            if (JSON.stringify(pred) === JSON.stringify(c.e)) score++;
        }
        if (score > 0) {
            console.log(`Score ${score}/5: OffS=${os.toFixed(2)}, WearS=${ws.toFixed(2)} [${cases.map(c=>JSON.stringify(simulate(p, c.i))===JSON.stringify(c.e)?'P':'F').join('')}]`);
        }
    }
}
