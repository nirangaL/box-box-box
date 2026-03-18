const fs = require('fs');
const path = require('path');

const t = JSON.parse(fs.readFileSync('data/test_cases/inputs/test_001.json', 'utf8'));
const exp = JSON.parse(fs.readFileSync('data/test_cases/expected_outputs/test_001.json', 'utf8')).finishing_positions;

function simulate(p) {
    const rc = t.race_config, base = rc.base_lap_time, pit = rc.pit_lane_time, total = rc.total_laps;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = t.strategies[`pos${i}`];
        // Grid gap
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: (i-1)*0.01, stops: s.pit_stops || [], si: 0 });
    }
    
    // Fundamental Tire Life logic
    const lifeList = { SOFT: p[0], MEDIUM: p[1], HARD: p[2] };
    const paceList = { SOFT: p[3], MEDIUM: p[4], HARD: p[5] };
    
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const tType = c.tire[0] === 'S' ? 'SOFT' : c.tire[0] === 'M' ? 'MEDIUM' : 'HARD';
            
            // "Age factor" = current age / max life. Wear scales exponentially or quadratically after life.
            // Or wear is simply a penalty per lap after max life.
            const overLife = Math.max(0, c.age - lifeList[tType]);
            
            let lapTime = base * paceList[tType];
            
            // Linear penalty when over life limit:
            lapTime += overLife * p[6];
            
            if (c.age === 1) lapTime += p[7]; // fresh bonus
            
            c.time += lapTime;
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b)=>(a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => {
            c.time += pit + q * p[8];
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b)=>(a.time - b.time) || (a.grid - b.grid)).map(x => x.id);
}

function getPairScore(p) {
    const pred = simulate(p);
    let score = 0;
    for(let i=0; i<20; i++) if (pred[i] === exp[i]) score++;
    return score;
}

// Genetic search focused on just TEST_001 to find ANY perfect model
async function search() {
    let pop = Array.from({length: 50}, () => [
        10+Math.random()*5, 20+Math.random()*10, 30+Math.random()*15, // life S,M,H (0,1,2)
        0.95, 0.97, 0.99, // pace S,M,H (3,4,5)
        0.1, // wear penalty (6)
        -0.2, // fresh bonus (7)
        0.5 // qPen (8)
    ]);
    
    let best = 0;
    for (let gen = 0; gen < 5000; gen++) {
        for (let i = 0; i < pop.length; i++) {
            const [a, b, c] = Array.from({length: 3}, () => pop[Math.floor(Math.random()*pop.length)]);
            const mutant = a.map((v, j) => v + 0.5 * (b[j] - c[j]));
            const s = getPairScore(mutant);
            if (s > best) {
                best = s;
                console.log(`Gen ${gen}: Best ${best}/20`);
                if (best === 20) {
                    console.log('PERFECT MATCH FOUND:', mutant);
                    return;
                }
            }
            if (s >= getPairScore(pop[i])) pop[i] = mutant;
        }
    }
}
search();
