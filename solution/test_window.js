const fs = require('fs');
const { simulate } = require('./race_simulator.js');

const sl = JSON.parse(fs.readFileSync('solution/learned_params.json')).params;
const cases = [];
const ids = ['008','014','024','044','064','074','084'];
for (const id of ids) {
    const input = JSON.parse(fs.readFileSync(`data/test_cases/inputs/test_${id}.json`));
    const output = JSON.parse(fs.readFileSync(`data/test_cases/expected_outputs/test_${id}.json`));
    cases.push({ input, exp: output.finishing_positions });
}

function simWindow(race, p, alpha) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (let j = 1; j <= 20; j++) {
        const sj = race.strategies[`pos${j}`];
        cars.push({ id: sj.driver_id, grid: j, tire: sj.starting_tire, age: 0, time: 0, stops: sj.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;
    // PARABOLIC WEAR SCALE
    const wearScale = 1 + alpha * tDelta * tDelta;
    
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire.toUpperCase();
            const wearAge = Math.max(0, c.age - p.shelfLife[ti]);
            const wear = (p.degr1[ti]*wearAge + p.degr2[ti]*wearAge*wearAge) * wearScale;
            c.time += base * (1 + p.offset[ti] + wear) + (c.age === 1 ? p.freshBonus[ti] : 0) + (c.si > 0 && c.age === 1 ? p.pitExitPenalty : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => { c.time += pit; c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++; });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x=>x.id);
}

for (let a of [0, 0.001, 0.005, 0.01]) {
    let ok = 0;
    for (const c of cases) {
        if (JSON.stringify(simWindow(c.input, sl, a)) === JSON.stringify(c.exp)) ok++;
    }
    console.log(`alpha=${a}: ${ok}/7`);
}
