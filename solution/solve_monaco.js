const fs = require('fs');
const path = require('path');

const input = JSON.parse(fs.readFileSync('data/test_cases/inputs/test_001.json'));
const exp = JSON.parse(fs.readFileSync('data/test_cases/expected_outputs/test_001.json')).finishing_positions;
const expRanks = exp.reduce((acc, id, r) => { acc[id] = r; return acc; }, {});

const BEST = JSON.parse(fs.readFileSync('solution/learned_params.json')).params;

function sim(p, qp) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = input.race_config;
    const cars = [];
    for (let j = 1; j <= 20; j++) {
        const sj = input.strategies[`pos${j}`];
        cars.push({ id: sj.driver_id, grid: j, tire: sj.starting_tire, age: 0, time: 0, stops: sj.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire.toUpperCase();
            const wear = (p.degr1[ti]*Math.max(0, c.age-p.shelfLife[ti]) + p.degr2[ti]*Math.pow(Math.max(0, c.age-p.shelfLife[ti]),2)) * (1 + p.tempCoeff[ti]*tDelta);
            c.time += base * (1 + p.offset[ti] + wear) + (c.age === 1 ? p.freshBonus[ti] : 0) + (c.si > 0 && c.age === 1 ? p.pitExitPenalty : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => {
            c.time += pit + q * qp;
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x=>x.id);
}

for (let qp of [0, 0.2, 0.4, 0.6, 0.8, 1.0]) {
    const res = sim(BEST, qp);
    let pairs = 0;
    for (let i = 0; i < 20; i++) {
        const ri = expRanks[res[i]];
        for (let j = i + 1; j < 20; j++) if (ri < expRanks[res[j]]) pairs++;
    }
    console.log(`qp=${qp} Monaco Pairs: ${pairs}/190`);
}
