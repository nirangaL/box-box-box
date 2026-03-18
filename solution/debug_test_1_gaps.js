const fs = require('fs');
const path = require('path');

const t1 = JSON.parse(fs.readFileSync('data/test_cases/inputs/test_001.json', 'utf8'));
const exp1 = JSON.parse(fs.readFileSync('data/test_cases/expected_outputs/test_001.json', 'utf8')).finishing_positions;
const p = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;

function simulate(p) {
    const rc = t1.race_config;
    const base = rc.base_lap_time, temp = rc.track_temp, pit = rc.pit_lane_time, total = rc.total_laps;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = t1.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
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
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => {
            c.time += pit + q * p.queuePenalty;
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
}

const res = simulate(p);
console.log('Rank | Expected | Predicted | Gap (s) | Strategy');
console.log('-----------------------------------------------');
for (let i = 0; i < 20; i++) {
    const pred = res[i];
    const match = exp1[i] === pred.id ? '✓' : '✗';
    const s = t1.strategies[`pos${pred.grid}`];
    const stops = (s.pit_stops || []).map(st => st.lap + ':' + st.to_tire).join(',');
    const gap = i > 0 ? (pred.time - res[i-1].time).toFixed(4) : '0.0000';
    console.log(`${(i+1).toString().padStart(4)} | ${exp1[i].padEnd(8)} | ${pred.id.padEnd(9)} | ${gap.padStart(7)} | ${match} | ${s.starting_tire} -> [${stops}]`);
}
