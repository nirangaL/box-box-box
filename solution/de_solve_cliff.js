const fs = require('fs');
const path = require('path');

const t = JSON.parse(fs.readFileSync('data/test_cases/inputs/test_001.json', 'utf8'));
const exp = JSON.parse(fs.readFileSync('data/test_cases/expected_outputs/test_001.json', 'utf8')).finishing_positions;

function simulateStep(p) {
    const rc = t.race_config, base = rc.base_lap_time, pit = rc.pit_lane_time, total = rc.total_laps;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = t.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: (i-1)*0.01, stops: s.pit_stops || [], si: 0 }); 
    }
    
    // Test a Step-Function Wear Pattern: Good for N laps, then falls off a cliff
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            
            // Instead of linear, wear is a specific penalty bucket based on age
            let lapTime = base;
            if (c.age > p[ti]) {
                 // Cliff
                 lapTime += p[ti+3] * (c.age - p[ti]);
            } else {
                 // Pre-cliff offset (freshness)
                 lapTime += p[ti+6];
            }
            c.time += lapTime;
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => {
            c.time += pit + q * p[9]; 
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x => x.id);
}

function getScore(p) {
    const res = simulateStep(p);
    let s = 0;
    for(let i=0; i<20; i++) if(res[i] === exp[i]) s++;
    return s;
}

// Genetic search for the Cliff model
let pop = Array.from({length: 50}, () => [
    10+Math.random()*5, 20+Math.random()*10, 30+Math.random()*10, // cliffs
    0.1+Math.random()*0.5, 0.05+Math.random()*0.3, 0.02+Math.random()*0.2, // cliff loss
    -1+Math.random(), -0.5+Math.random(), -0.2+Math.random(), // base offset
    0.1 // qPen
]);

async function solve() {
    let best = 0;
    console.log('Solving Step/Cliff Physics DE for TEST_001...');
    for (let gen = 0; gen < 2000; gen++) {
        for (let i = 0; i < pop.length; i++) {
            const [a, b, c] = Array.from({length: 3}, () => pop[Math.floor(Math.random()*pop.length)]);
            const mutant = a.map((v, j) => {
                let m = v + 0.5 * (b[j] - c[j]);
                if (j < 3) return Math.round(m); // Integer cliffs
                return m;
            });
            const s = getScore(mutant);
            if (s > best) {
                best = s;
                console.log(`Gen ${gen}: Best ${best}/20`);
                if (best >= 20) {
                    console.log('PERFECT CLIFF MODEL FOUND!', mutant);
                    return;
                }
            }
            if (s >= getScore(pop[i])) pop[i] = mutant;
        }
    }
}
solve();
