const fs = require('fs');
const path = require('path');

function sim(p, fpS, fpM, fpH) {
    const inp = JSON.parse(fs.readFileSync('data/test_cases/inputs/test_014.json'));
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = inp.race_config;
    const cars = [];
    for (let j = 1; j <= 20; j++) {
        const sj = inp.strategies[`pos${j}`];
        cars.push({ id: sj.driver_id, grid: j, tire: sj.starting_tire, age: 0, time: 0, stops: sj.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;
    const fPaces = { 'SOFT': fpS, 'MEDIUM': fpM, 'HARD': fpH };
    for (let lap = 1; lap <= total; lap++) {
        const fl = (total - lap) / total;
        for (const c of cars) {
            c.age++;
            const ti = c.tire.toUpperCase();
            const wear = (p.degr1[ti]*Math.max(0, c.age-p.shelfLife[ti]) + p.degr2[ti]*Math.pow(Math.max(0, c.age-p.shelfLife[ti]),2)) * (1 + p.tempCoeff[ti]*tDelta);
            // FUEL PACE Penalty: higher fuel = slower car
            c.time += base * (1 + p.offset[ti] + wear + fl * fPaces[ti]) + (c.age === 1 ? p.freshBonus[ti] : 0) + (c.si > 0 && c.age === 1 ? p.pitExitPenalty : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => { c.time += pit; c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++; });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x=>x.id);
}

const sl = JSON.parse(fs.readFileSync('solution/learned_params.json')).params;
const exp = JSON.parse(fs.readFileSync('data/test_cases/expected_outputs/test_014.json')).finishing_positions;

for (let fpH of [0, 0.02, 0.04, 0.06, 0.08]) {
    const res = sim(sl, 0.01, 0, fpH); // fpS = 0.01 fixed
    console.log(`fpH=${fpH.toFixed(2)} P3=${res[2]} P4=${res[3]} | PASS? ${JSON.stringify(res)===JSON.stringify(exp)}`);
}
