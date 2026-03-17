const fs = require('fs');

const test1 = JSON.parse(fs.readFileSync('data/test_cases/inputs/test_001.json', 'utf8'));
const expected = JSON.parse(fs.readFileSync('data/test_cases/expected_outputs/test_001.json', 'utf8')).finishing_positions;
const p = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;

function simulate(delayFactor) {
    const rc = test1.race_config;
    const base = rc.base_lap_time, temp = rc.track_temp, pit = rc.pit_lane_time, total = rc.total_laps;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = test1.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: (i-1) * delayFactor, stops: s.pit_stops || [], si: 0 });
    }
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 'SOFT' : c.tire[0] === 'M' ? 'MEDIUM' : 'HARD';
            const wearAge = Math.max(0, c.age - p.shelfLife[ti]);
            const wearEffect = (p.degr1[ti] * wearAge + p.degr2[ti] * wearAge * wearAge) * (1 + p.tempCoeff[ti]*(temp-30));
            c.time += base * (1 + p.offset[ti] + wearEffect) + (c.age === 1 ? p.freshBonus[ti] : 0) + (c.si > 0 && c.age === 1 ? p.pitExitPenalty : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => a.time - b.time); // Use actual time (including delay) for queue order?
        pitting.forEach((c, q) => {
            c.time += pit; // No queue penalty for now
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => a.time - b.time).map(x => x.id);
}

console.log('Scanning for Start Delay Factor...');
for (let d = 0; d <= 0.5; d += 0.001) {
    const pred = simulate(d);
    // Sequence check: D006 > D018 > D003 > D009 > D019
    const i6 = pred.indexOf('D006'), i18 = pred.indexOf('D018'), i3 = pred.indexOf('D003'), i9 = pred.indexOf('D009'), i19 = pred.indexOf('D019');
    if (i6 < i18 && i18 < i3 && i3 < i9 && i9 < i19) {
        console.log(`FOUND sequence at delayFactor = ${d.toFixed(4)}`);
        // Check if full match
        if (JSON.stringify(pred) === JSON.stringify(expected)) {
            console.log('FULL MATCH!');
            process.exit(0);
        }
    }
}
