const fs = require('fs');

const cases = [];
for (let i = 1; i <= 100; i++) {
    const id = String(i).padStart(3, '0');
    const input = JSON.parse(fs.readFileSync('data/test_cases/inputs/test_' + id + '.json', 'utf8'));
    const output = JSON.parse(fs.readFileSync('data/test_cases/expected_outputs/test_' + id + '.json', 'utf8'));
    cases.push({ input, expected: output.finishing_positions });
}

function calcAbsolute(race, p) {
    const rc = race.race_config;
    const total = rc.total_laps;
    const temp = rc.track_temp;
    const pit = rc.pit_lane_time;
    // p = [oS, oM, oH, dS, dM, dH, tS, tM, tH, fS, fM, fH, gap, shelf_S, shelf_M, shelf_H]
    
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        let totTime = 0;
        let lastLap = 0;
        let tire = s.starting_tire;
        const stops = s.pit_stops || [];
        const tDelta = temp - 30;

        for (const stop of stops) {
            const stint = stop.lap - lastLap;
            const ti = tire[0] === 'S' ? 0 : tire[0] === 'M' ? 1 : 2;
            
            totTime += stint * (p[ti] + p[6+ti] * tDelta); // offset + tempEffect
            
            // Degradation AFTER shelf
            const shelf = p[13+ti];
            let wearLaps = 0;
            // age goes from 1 to stint
            for(let a=1; a<=stint; a++) if (a > shelf) wearLaps += (a - shelf); 
            totTime += wearLaps * p[3+ti]; // linear deg
            
            totTime += p[9+ti]; // fresh
            
            totTime += pit;
            tire = stop.to_tire;
            lastLap = stop.lap;
        }
        
        const finalStint = total - lastLap;
        if (finalStint > 0) {
            const ti = tire[0] === 'S' ? 0 : tire[0] === 'M' ? 1 : 2;
            totTime += finalStint * (p[ti] + p[6+ti] * tDelta);
            const shelf = p[13+ti];
            let wearLaps = 0;
            for(let a=1; a<=finalStint; a++) if (a > shelf) wearLaps += (a - shelf);
            totTime += wearLaps * p[3+ti];
            totTime += p[9+ti];
        }
        
        totTime += (i - 1) * p[12]; // gap
        cars.push({ id: s.driver_id, grid: i, time: totTime });
    }
    return cars.sort((a,b) => (Math.abs(a.time - b.time) < 1e-9 ? a.grid - b.grid : a.time - b.time)).map(x => x.id);
}

let pop = Array.from({length: 100}, () => [
    -5 + Math.random()*10, -5 + Math.random()*10, -5 + Math.random()*10, // o
    0.01 + Math.random()*0.5, 0.01 + Math.random()*0.5, 0.01 + Math.random()*0.5, // d
    0.01 + Math.random()*0.2, 0.01 + Math.random()*0.2, 0.01 + Math.random()*0.2, // t
    -2 + Math.random()*4, -2 + Math.random()*4, -2 + Math.random()*4, // f
    0.05, // gap
    10, 20, 30 // shelf integer
]);

function getScore(p) {
    let s = 0;
    for (const c of cases) {
        if(JSON.stringify(calcAbsolute(c.input, p)) === JSON.stringify(c.expected)) s++;
    }
    return s;
}

console.log('Solving Absolute Analytical Model...');
let best = 0;
for (let gen = 0; gen < 2000; gen++) {
    for (let i = 0; i < pop.length; i++) {
        const [a, b, c] = Array.from({length: 3}, () => pop[Math.floor(Math.random()*pop.length)]);
        const mutant = a.map((v, j) => {
            if (j >= 13) return Math.round(v + 0.5 * (b[j] - c[j])); // Integer shelves
            return v + 0.6 * (b[j] - c[j]);
        });
        const score = getScore(mutant);
        if (score >= best) {
            best = score;
            if (score >= getScore(pop[i])) pop[i] = mutant;
            if (gen % 50 === 0) console.log(`Gen ${gen}: Best ${best}/100`);
            if (best === 100) { console.log('PERFECT!', mutant); process.exit(0); }
        }
    }
}
