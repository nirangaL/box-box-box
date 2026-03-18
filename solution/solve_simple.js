const fs = require('fs');
const path = require('path');

const t = JSON.parse(fs.readFileSync('data/test_cases/inputs/test_001.json', 'utf8'));
const exp = JSON.parse(fs.readFileSync('data/test_cases/expected_outputs/test_001.json', 'utf8')).finishing_positions;

function simulate(p) {
    const rc = t.race_config, base = rc.base_lap_time, pit = rc.pit_lane_time, total = rc.total_laps;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = t.strategies[`pos${i}`];
        // What if the grid penalty is NOT 0.01s * index, but a fixed multiplier or index itself?
        // Like time = i * 0.05
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: (i-1)*p[5], stops: s.pit_stops || [], si: 0 }); 
    }
    
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            
            // Very simple math: Base Pace + Age * Wear
            c.time += base + p[ti] + c.age * p[ti+2];
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => {
            c.time += pit; 
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x => x.id);
}

// Just brute force simple parameters for TEST 1 based on base 80s logic
// S pace, M pace, H pace, S wear, M wear, H wear, Grid Gap
const paceRanges = [-5, -4, -3, -2, -1, 0, 1];
const wearRanges = [0.05, 0.1, 0.15, 0.2];
const gaps = [0, 0.01, 0.05, 0.1];

let perfects = 0;
for (const pS of paceRanges) {
   for (const wS of wearRanges) {
   for (const pM of paceRanges) {
   for (const wM of wearRanges) {
   for (const pH of paceRanges) {
   for (const wH of wearRanges) {
       for (const g of gaps) {
           const res = simulate([pS, pM, pH, wS, wM, wH, g]);
           let ok = 0;
           for(let i=0; i<20; i++) if(res[i] === exp[i]) ok++;
           if (ok === 20) {
              perfects++;
              console.log(`Perfect: ${JSON.stringify([pS, pM, pH, wS, wM, wH, g])}`);
           }
       }
   }}}}}
}
console.log(`Found ${perfects} extremely simple perfect setups`);
