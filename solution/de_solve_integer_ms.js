const fs = require('fs');
const path = require('path');

const t = JSON.parse(fs.readFileSync('data/test_cases/inputs/test_001.json', 'utf8'));
const exp = JSON.parse(fs.readFileSync('data/test_cases/expected_outputs/test_001.json', 'utf8')).finishing_positions;

function simMs(p) {
    const rc = t.race_config, base = Math.round(rc.base_lap_time * 1000), pit = Math.round(rc.pit_lane_time * 1000), total = rc.total_laps;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = t.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: (i-1)*10, stops: s.pit_stops || [], si: 0 }); 
    }
    
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            const lapTime = base + p[ti*2] + c.age * p[ti*2 + 1];
            c.time += lapTime + (c.age === 1 ? p[6] : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => {
            c.time += pit + q * p[7]; 
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x => x.id);
}

function getScore(p) {
    const res = simMs(p);
    let s = 0;
    for(let i=0; i<20; i++) if(res[i] === exp[i]) s++;
    return s;
}

// Genetic search for the MS model
let pop = Array.from({length: 50}, () => [
    -5000 + Math.random()*2000, 100 + Math.random()*100, // S
    -3000 + Math.random()*2000, 50 + Math.random()*50,  // M
    -1000 + Math.random()*2000, 10 + Math.random()*50,  // H
    -500 + Math.random()*500, // fBonus
    0 // qPen
]);

async function solve() {
    let best = 0;
    console.log('Solving Integer MS Physics DE for TEST_001...');
    for (let gen = 0; gen < 5000; gen++) {
        for (let i = 0; i < pop.length; i++) {
            const [a, b, c] = Array.from({length: 3}, () => pop[Math.floor(Math.random()*pop.length)]);
            const mutant = a.map((v, j) => Math.round(v + 0.5 * (b[j] - c[j])));
            const s = getScore(mutant);
            if (s > best) {
                best = s;
                console.log(`Gen ${gen}: Best ${best}/20`);
                if (best >= 20) {
                    console.log('PERFECT MS MODEL FOUND!', mutant);
                    return;
                }
            }
            if (s >= getScore(pop[i])) pop[i] = mutant;
        }
    }
}
solve();
