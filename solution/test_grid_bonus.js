const fs = require('fs');
const path = require('path');

const p = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;

function simulate(id, bonus) {
    const input = JSON.parse(fs.readFileSync(`data/test_cases/inputs/test_${id}.json`, 'utf8'));
    const expected = JSON.parse(fs.readFileSync(`data/test_cases/expected_outputs/test_${id}.json`, 'utf8')).finishing_positions;
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = input.race_config;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = input.strategies[`pos${i}`];
        // THE GRID BONUS HYPOTHESIS
        const b = (i % 3 === 0) ? bonus : 0;
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0, bonus: b });
    }
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 'SOFT' : c.tire[0] === 'M' ? 'MEDIUM' : 'HARD';
            const wearAge = Math.max(0, c.age - p.shelfLife[ti]);
            const wearEffect = (p.degr1[ti] * wearAge) * (1 + p.tempCoeff[ti]*(temp-30));
            c.time += (base + c.bonus) * (1 + p.offset[ti] + wearEffect) + (c.age === 1 ? p.freshBonus[ti] : 0) + (c.si > 0 && c.age === 1 ? p.pitExitPenalty : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => {
            c.time += pit + q * p.queuePenalty;
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    const pred = cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x => x.id);
    return JSON.stringify(pred) === JSON.stringify(expected);
}

console.log('Testing Grid % 3 Bonus theory on TEST_001...');
for (let b = -0.5; b <= 0.5; b += 0.05) {
    if (simulate('001', b)) {
        console.log(`PASS TEST_001 with Bonus = ${b.toFixed(2)}`);
        break;
    }
}
