const fs = require('fs');
const path = require('path');
const { simulate } = require('./race_simulator.js');

const ids = ['008','014','024','044','064','074','084'];
const sl = JSON.parse(fs.readFileSync('solution/learned_params.json')).params;

function simLocal(race, p, pS, pM, pH) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (let j = 1; j <= 20; j++) {
        const sj = race.strategies[`pos${j}`];
        cars.push({ id: sj.driver_id, grid: j, tire: sj.starting_tire, age: 0, time: 0, stops: sj.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;
    const pens = { 'SOFT': pS, 'MEDIUM': pM, 'HARD': pH };
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire.toUpperCase();
            const wearAge = Math.max(0, c.age - p.shelfLife[ti]);
            const wear = (p.degr1[ti]*wearAge + p.degr2[ti]*wearAge*wearAge) * (1 + p.tempCoeff[ti]*tDelta);
            let lp = base * (1 + p.offset[ti] + wear) + (c.age === 1 ? p.freshBonus[ti] : 0) + (c.si > 0 && c.age === 1 ? p.pitExitPenalty : 0);
            // COLD PENALTY
            if (temp < 25) lp += pens[ti];
            c.time += lp;
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => { c.time += pit; c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++; });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x=>x.id);
}

for (let pH of [-0.5, -0.2, 0, 0.2, 0.5]) {
    let ok = 0;
    for (const id of ids) {
        const inp = JSON.parse(fs.readFileSync(`data/test_cases/inputs/test_${id}.json`));
        const exp = JSON.parse(fs.readFileSync(`data/test_cases/expected_outputs/test_${id}.json`)).finishing_positions;
        if (JSON.stringify(simLocal(inp, sl, 0, 0, pH)) === JSON.stringify(exp)) ok++;
    }
    console.log(`pH=${pH}: ${ok}/7`);
}
