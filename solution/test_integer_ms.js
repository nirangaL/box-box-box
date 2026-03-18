const fs = require('fs');
const path = require('path');

const t = JSON.parse(fs.readFileSync('data/test_cases/inputs/test_001.json', 'utf8'));
const exp = JSON.parse(fs.readFileSync('data/test_cases/expected_outputs/test_001.json', 'utf8')).finishing_positions;
const strats = t.strategies;

const d = [];
for (let i = 1; i <= 20; i++) d.push({ id: strats[`pos${i}`].driver_id, grid: i, starting_tire: strats[`pos${i}`].starting_tire, pit_lap: strats[`pos${i}`].pit_stops[0].lap, to_tire: strats[`pos${i}`].pit_stops[0].to_tire, rank: exp.indexOf(strats[`pos${i}`].driver_id) + 1 });

d.sort((a,b) => a.rank - b.rank);

// What if lap times are strictly integer milliseconds?
// Let's implement EXACT 1-millisecond step simulation

function simulateMs(msPace, msDegradation) {
    const rc = t.race_config, base = Math.round(rc.base_lap_time * 1000), pit = Math.round(rc.pit_lane_time * 1000), total = rc.total_laps;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = t.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: (i-1)*10, stops: s.pit_stops || [], si: 0 }); 
        // 10ms grid gap = 0.01s
    }
    
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            
            // PURE INTEGER PHYSICS
            const lapTime = base + msPace[ti] + c.age * msDegradation[ti];
            c.time += lapTime;
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => {
            c.time += pit; // No queue penalty or discrete queue penalty?
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x => x.id);
}

const paceS = -3500; // -3.5s
const paceM = -2000; // -2.0s
const paceH = -500;  // -0.5s

const degS = 180; // 0.18s/lap
const degM = 80;  // 0.08s/lap
const degH = 30;  // 0.03s/lap

const res = simulateMs([paceS, paceM, paceH], [degS, degM, degH]);
let score = 0;
for(let i=0; i<20; i++) {
    if(res[i] === exp[i]) score++;
}
console.log(`Integer MS Model Match: ${score}/20`);
