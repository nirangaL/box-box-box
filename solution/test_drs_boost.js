const fs = require('fs');
const path = require('path');

const t = JSON.parse(fs.readFileSync('data/test_cases/inputs/test_001.json', 'utf8'));
const exp = JSON.parse(fs.readFileSync('data/test_cases/expected_outputs/test_001.json', 'utf8')).finishing_positions;
const p = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;

function simulateDRS(boost) {
    const rc = t.race_config, base = rc.base_lap_time, total = rc.total_laps, pit = rc.pit_lane_time;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = t.strategies[`pos${i}`];
        // 0.01s gap
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: (i-1)*0.01, stops: s.pit_stops || [], si: 0 });
    }
    
    for (let lap = 1; lap <= total; lap++) {
        // Calculate raw times first
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 'SOFT' : c.tire[0] === 'M' ? 'MEDIUM' : 'HARD';
            const wearAge = Math.max(0, c.age - p.shelfLife[ti]);
            c.time += base * (1 + p.offset[ti]) + p.degr1[ti] * wearAge;
        }
        
        // APPLY DRS: If gap to car in front < 1.0s, subtract boost
        const currentOrder = [...cars].sort((a,b)=>a.time - b.time);
        for (let i = 1; i < 20; i++) {
            const gap = currentOrder[i].time - currentOrder[i-1].time;
            if (gap < 1.0) currentOrder[i].time -= boost;
        }

        // Pit stops
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b)=>(a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => {
            c.time += pit; c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    const res = cars.sort((a,b)=>a.time - b.time).map(x => x.id);
    let match = 0;
    for(let i=0; i<20; i++) if(res[i] === exp[i]) match++;
    return match;
}

console.log('Sweeping DRS Boost...');
for (let b = 0.0; b <= 1.5; b += 0.1) {
    console.log(`Boost ${b.toFixed(1)}s: ${simulateDRS(b)}/20 Matches`);
}
