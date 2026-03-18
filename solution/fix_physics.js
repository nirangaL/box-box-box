const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', 'data', 'test_cases');
function loadTestCases() {
    const cases = [];
    for (let i = 1; i <= 100; i++) {
        const id = String(i).padStart(3, '0');
        const input = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'inputs', `test_${id}.json`), 'utf8'));
        const output = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'expected_outputs', `test_${id}.json`), 'utf8'));
        cases.push({ input, expected: output.finishing_positions, em: output.finishing_positions.reduce((acc,id,rank)=>{acc[id]=rank;return acc;},{}) });
    }
    return cases;
}

function simulate(race, p) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            const wearAge = Math.max(0, c.age - p[16+ti]);
            const wearEffect = (p[6+ti]*wearAge + p[9+ti]*wearAge*wearAge) * (1 + p[3+ti]*tDelta);
            
            c.time += base * (1 + p[ti] + wearEffect) 
                   + (c.age === 1 ? p[12+ti] : 0) // Fresh Bonus (Negative)
                   + (c.si > 0 && c.age === 1 ? p[15] : 0); // Pit Exit Penalty (Positive)
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time-b.time) || (a.grid-b.grid));
        pitting.forEach((c, q) => {
            c.time += pit + q * p[19];
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time-b.time) || (a.grid-b.grid)).map(x=>x.id);
}

function score(cases, p) {
    let exact = 0, pairs = 0;
    for (const c of cases) {
        const pred = simulate(c.input, p);
        if (JSON.stringify(pred) === JSON.stringify(c.expected)) { exact++; pairs += 190; }
        else { for(let i=0;i<20;i++){ const ri=c.em[pred[i]]; for(let j=i+1;j<20;j++) if(ri<c.em[pred[j]]) pairs++; } }
    }
    return exact * 1000000 + pairs;
}

const RANGES = [
    [-0.1, 0.1], [-0.1, 0.1], [-0.1, 0.1], // offsets
    [0.01, 0.05], [0.01, 0.05], [0.01, 0.05], // tempCoeff
    [0, 0.02], [0, 0.01], [0, 0.005], // d1
    [0, 0.001], [0, 0.0005], [0, 0.0002], // d2
    [-2, 0], [-2, 0], [-2, 0], // Fresh Bonus (Negative ONLY)
    [0, 2], // Pit Exit Penalty (Positive ONLY)
    [0, 10], [10, 20], [20, 40], // shelfLife
    [0, 1.0] // queuePenalty
];

async function main() {
    const cases = loadTestCases();
    let bestP = RANGES.map(r => r[0] + Math.random()*(r[1]-r[0]));
    let bestScore = score(cases, bestP);
    
    console.log(`Starting Valid-Physics Fix...`);
    
    for (let i = 0; i < 50000; i++) {
        const idx = Math.floor(Math.random() * RANGES.length);
        const old = bestP[idx];
        bestP[idx] += (Math.random()-0.5) * 0.1 * (RANGES[idx][1]-RANGES[idx][0]);
        bestP[idx] = Math.max(RANGES[idx][0], Math.min(RANGES[idx][1], bestP[idx]));
        
        const s = score(cases, bestP);
        if(s >= bestScore) {
            bestScore = s;
            if(i % 100 === 0) console.log(`Step ${i}: ${Math.floor(s/1000000)}/100 (${(s%1000000/190).toFixed(2)})`);
        } else {
            bestP[idx] = old;
        }
    }
    
    save(bestP, bestScore);
}

function save(p, s) {
    fs.writeFileSync('solution/learned_params.json', JSON.stringify({
        params: {
            offset: { SOFT: p[0], MEDIUM: p[1], HARD: p[2] },
            tempCoeff: { SOFT: p[3], MEDIUM: p[4], HARD: p[5] },
            degr1: { SOFT: p[6], MEDIUM: p[7], HARD: p[8] },
            degr2: { SOFT: p[9], MEDIUM: p[10], HARD: p[11] },
            freshBonus: { SOFT: p[12], MEDIUM: p[13], HARD: p[14] },
            pitExitPenalty: p[15],
            shelfLife: { SOFT: p[16], MEDIUM: p[17], HARD: p[18] },
            queuePenalty: p[19]
        },
        exact: Math.floor(s/1000000),
        pairs: s % 1000000
    }, null, 2));
}
main();
