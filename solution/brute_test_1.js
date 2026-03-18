const fs = require('fs');
const path = require('path');

const t1 = JSON.parse(fs.readFileSync('data/test_cases/inputs/test_001.json', 'utf8'));
const exp1 = JSON.parse(fs.readFileSync('data/test_cases/expected_outputs/test_001.json', 'utf8')).finishing_positions;

function simulate(p) {
    const rc = t1.race_config;
    const base = rc.base_lap_time, temp = rc.track_temp, pit = rc.pit_lane_time, total = rc.total_laps;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = t1.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: (i-1)*0.01, stops: s.pit_stops || [], si: 0 });
    }
    
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            const wearAge = Math.max(0, c.age - p.shelf[ti]);
            const wearEffect = p.wear[ti] * wearAge;
            const tempEffect = (temp - 30) * p.tempCoef;
            c.time += base * (1 + p.offset[ti]) + wearEffect + tempEffect;
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

const p = {
    shelf: [13, 23, 34],
    wear: [0.1, 0.05, 0.02],
    offset: [-0.05, -0.03, -0.01],
    tempCoef: 0.01,
    qPen: 0.5
};

console.log('Brute-Force Bracketing with Clean Numbers...');

const grids = [0, 0.01, 0.02, 0.05, 0.1];
const offsets = [-0.1, -0.05, -0.02, -0.01, 0];
const wears = [0.01, 0.02, 0.05, 0.1, 0.15];

for (const o_soft of offsets) {
  for (const w_soft of wears) {
    p.offset[0] = o_soft;
    p.wear[0] = w_soft;
    const res = simulate(p);
    let match = 0;
    for(let i=0; i<20; i++) if(res[i] === exp1[i]) match++;
    if (match >= 10) {
        console.log(`Match ${match}/20: OffS=${o_soft}, WearS=${w_soft}`);
        if(match === 20) {
            console.log('!!! PERFECT "CLEAN" MODEL IDENTIFIED !!!');
            process.exit(0);
        }
    }
  }
}
