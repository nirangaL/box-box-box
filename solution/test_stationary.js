const fs = require('fs');
const path = require('path');

const t8 = JSON.parse(fs.readFileSync('data/test_cases/inputs/test_008.json', 'utf8'));
const exp8 = JSON.parse(fs.readFileSync('data/test_cases/expected_outputs/test_008.json', 'utf8')).finishing_positions;
const p = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;

function simulate(statTime) {
    const rc = t8.race_config;
    const base = rc.base_lap_time, temp = rc.track_temp, pit = rc.pit_lane_time, total = rc.total_laps;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = t8.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
    }
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 'SOFT' : c.tire[0] === 'M' ? 'MEDIUM' : 'HARD';
            const wearAge = Math.max(0, c.age - p.shelfLife[ti]);
            const wearEffect = (p.degr1[ti] * wearAge) * (1 + p.tempCoeff[ti]*(temp-30));
            c.time += base * (1 + p.offset[ti] + wearEffect) + (c.age === 1 ? p.freshBonus[ti] : 0) + (c.si > 0 && c.age === 1 ? p.pitExitPenalty : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => {
            // Pit Lane Time + Stationary Time
            c.time += pit + statTime + q * p.queuePenalty;
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x => x.id);
}

console.log('Testing Stationary Pit Time for TEST_008...');
for (let st = 0; st <= 5.0; st += 0.1) {
    const pred = simulate(st);
    if (JSON.stringify(pred) === JSON.stringify(exp8)) {
        console.log(`PASS TEST_008 with stationaryTime = ${st.toFixed(2)}`);
        break;
    }
}
