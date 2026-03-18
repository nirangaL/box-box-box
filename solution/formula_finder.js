const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data', 'historical_races');
function loadRaces(num) {
    let races = [];
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort();
    for (let i = 0; i < Math.min(num, files.length); i++) {
        races = races.concat(JSON.parse(fs.readFileSync(path.join(DATA_DIR, files[i]), 'utf8')));
    }
    return races;
}

function simulateA(race, p) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (const [pos, s] of Object.entries(race.strategies)) {
        cars.push({ id: s.driver_id, grid: parseInt(pos.slice(3)), tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            const wearAge = Math.max(0, c.age - p[16+ti]);
            const wear = (p[6+ti]*wearAge + p[9+ti]*wearAge*wearAge) * (1 + p[3+ti]*tDelta);
            c.time += base * (1 + p[ti] + wear) + (c.age === 1 ? p[12+ti] : 0) + (c.si > 0 && c.age === 1 ? p[15] : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => { c.time += pit + q*p[19]; c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++; });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x=>x.id);
}

function simulateB(race, p) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (const [pos, s] of Object.entries(race.strategies)) {
        cars.push({ id: s.driver_id, grid: parseInt(pos.slice(3)), tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            const wearAge = Math.max(0, c.age - p[16+ti]);
            const wear = (p[6+ti]*wearAge + p[9+ti]*wearAge*wearAge) * (1 + p[3+ti]*tDelta);
            // Multiplicative: (1 + offset) * (1 + wear)
            c.time += base * (1 + p[ti]) * (1 + wear) + (c.age === 1 ? p[12+ti] : 0) + (c.si > 0 && c.age === 1 ? p[15] : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => { c.time += pit + q*p[19]; c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++; });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x=>x.id);
}

function score(races, simFn, p) {
    let exact = 0;
    for (const r of races) {
        if (JSON.stringify(simFn(r, p)) === JSON.stringify(r.finishing_positions)) exact++;
    }
    return exact;
}

const races = loadRaces(5); // 5000 races
const p = [
    -0.057, -0.046, -0.038, // offset
    0.02, 0.02, 0.02,       // temp
    0.016, 0.008, 0.004,    // d1
    0.001, 0.0005, 0.0002,  // d2
    -0.5, -0.2, 0,          // fresh
    -2.0,                   // pit exit
    10, 20, 30,             // shelf
    0.5                     // queue
];

function simulateC(race, p) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (const [pos, s] of Object.entries(race.strategies)) {
        cars.push({ id: s.driver_id, grid: parseInt(pos.slice(3)), tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            const wearAge = Math.max(0, c.age - p[16+ti]);
            const wearSeconds = (p[6+ti]*wearAge + p[9+ti]*wearAge*wearAge) * (1 + p[3+ti]*tDelta);
            // Additive Seconds: base + offsetSeconds + wearSeconds
            c.time += base + p[ti] + wearSeconds + (c.age === 1 ? p[12+ti] : 0) + (c.si > 0 && c.age === 1 ? p[15] : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => { c.time += pit + q*p[19]; c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++; });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x=>x.id);
}

console.log(`Formula A (Additive): ${score(races, simulateA, p)} / 5000`);
console.log(`Formula B (Multiplicative): ${score(races, simulateB, p)} / 5000`);
console.log(`Formula C (Additive Seconds): ${score(races, simulateC, p)} / 5000`);
