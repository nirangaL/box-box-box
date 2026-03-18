const fs = require('fs');
const { simulate } = require('./race_simulator.js');

const sl = JSON.parse(fs.readFileSync('solution/learned_params.json')).params;
const cases = [];
const TEST_DIR = 'data/test_cases';
for (let i = 1; i <= 100; i++) {
    const id = String(i).padStart(3, '0');
    const input = JSON.parse(fs.readFileSync(`${TEST_DIR}/inputs/test_${id}.json`));
    const output = JSON.parse(fs.readFileSync(`${TEST_DIR}/expected_outputs/test_${id}.json`));
    cases.push({ input, exp: output.finishing_positions });
}

function simDist(race, p) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (let j = 1; j <= 20; j++) {
        const sj = race.strategies[`pos${j}`];
        cars.push({ id: sj.driver_id, grid: j, tire: sj.starting_tire, age: 0, time: 0, stops: sj.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire.toUpperCase();
            // DISTANCE BASED SHELF
            // assume sl.shelfLife is for an 80s lap
            const shelf = p.shelfLife[ti] * (80 / base);
            const wearAge = Math.max(0, c.age - shelf);
            const wear = (p.degr1[ti]*wearAge + p.degr2[ti]*wearAge*wearAge) * (1 + p.tempCoeff[ti]*tDelta);
            c.time += base * (1 + p.offset[ti] + wear) + (c.age === 1 ? p.freshBonus[ti] : 0) + (c.si > 0 && c.age === 1 ? p.pitExitPenalty : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => { c.time += pit; c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++; });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x=>x.id);
}

let ok = 0;
for (const c of cases) if (JSON.stringify(simDist(c.input, sl)) === JSON.stringify(c.exp)) ok++;
console.log(`Distance Based Shelf Score: ${ok}/100`);
