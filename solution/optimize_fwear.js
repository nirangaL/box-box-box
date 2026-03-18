const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', 'data', 'test_cases');
function simulate(race, p) {
    const rc = race.race_config;
    const base = rc.base_lap_time, temp = rc.track_temp, pit = rc.pit_lane_time, total = rc.total_laps;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;
    for (let lap = 1; lap <= total; lap++) {
        const fuel = (total - lap) / total;
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            const wearAge = Math.max(0, c.age - p[16 + ti]);
            // Compound-specific fuel wear scaling
            const wearScale = (1 + p[3 + ti] * tDelta + p[20 + ti] * fuel);
            const wearEffect = (p[6 + ti] * wearAge + p[9 + ti] * wearAge * wearAge) * wearScale;
            
            let lapTime = base * (1 + p[ti] + wearEffect) + (c.age === 1 ? p[12 + ti] : 0) + (c.si > 0 && c.age === 1 ? p[15] : 0);
            c.time += lapTime;
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => {
            c.time += pit + q * p[19];
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x=>x.id);
}

function score(cases, p) {
    let exact = 0, pairs = 0;
    for (const c of cases) {
        const pred = simulate(c.input, p);
        if (JSON.stringify(pred) === JSON.stringify(c.expected)) {
            exact++;
            pairs += 190;
        } else {
             for (let i = 0; i < 20; i++) {
                const ri = c.expectedRank[pred[i]];
                for (let j = i + 1; j < 20; j++) if (ri < c.expectedRank[pred[j]]) pairs++;
            }
        }
    }
    return exact * 1e6 + pairs;
}

const cases = [];
for (let i = 1; i <= 100; i++) {
    const id = String(i).padStart(3, '0');
    const input = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'inputs', `test_${id}.json`)));
    const output = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'expected_outputs', `test_${id}.json`)));
    cases.push({
        input,
        expected: output.finishing_positions,
        expectedRank: output.finishing_positions.reduce((acc, id, r) => { acc[id] = r; return acc; }, {})
    });
}

const BEST = JSON.parse(fs.readFileSync('solution/learned_params.json')).params;
const pBase = [
    BEST.offset.SOFT, BEST.offset.MEDIUM, BEST.offset.HARD,
    BEST.tempCoeff.SOFT, BEST.tempCoeff.MEDIUM, BEST.tempCoeff.HARD,
    BEST.degr1.SOFT, BEST.degr1.MEDIUM, BEST.degr1.HARD,
    BEST.degr2.SOFT || 0, BEST.degr2.MEDIUM || 0, BEST.degr2.HARD || 0,
    BEST.freshBonus.SOFT, BEST.freshBonus.MEDIUM, BEST.freshBonus.HARD,
    BEST.pitExitPenalty,
    BEST.shelfLife.SOFT, BEST.shelfLife.MEDIUM, BEST.shelfLife.HARD,
    BEST.queuePenalty || 0,
    0.0, 0.0, 0.0 // p[20,21,22] fuel wear coefficients
];

async function main() {
    let popSize = 40;
    let pop = Array.from({length: popSize}, () => pBase.map((v, i) => i < 20 ? v : 0.1 * Math.random()));
    pop[0] = [...pBase];

    // Tight RANGES for refinement
    const RANGES = pBase.map((v, i) => [v - 0.05, v + 0.05]);
    for(let i=20; i<=22; i++) RANGES[i] = [0, 5.0]; // Allow high fuel wear

    let scores = pop.map(pi => score(cases, pi));
    let bestIdx = scores.indexOf(Math.max(...scores));
    console.log(`Starting Score: ${Math.floor(scores[bestIdx]/1e6)}/100`);
    
    for (let gen = 0; gen < 1000; gen++) {
        for (let i = 0; i < popSize; i++) {
            let a,b,c;
            do{a=Math.floor(Math.random()*popSize);}while(a===i);
            do{b=Math.floor(Math.random()*popSize);}while(b===i||b===a);
            do{c=Math.floor(Math.random()*popSize);}while(c===i||c===a||c===b);
            const mutant = pop[a].map((val, idx) => {
                if (Math.random() < 0.9) {
                    let v = val + 0.7 * (pop[b][idx] - pop[c][idx]);
                    return Math.max(RANGES[idx][0], Math.min(RANGES[idx][1], v));
                }
                return pop[i][idx];
            });
            const s = score(cases, mutant);
            if (s >= scores[i]) {
                pop[i] = mutant; scores[i] = s;
                if (s > scores[bestIdx]) {
                    bestIdx = i;
                    console.log(`Gen ${gen}: Rank ${Math.floor(s/1e6)}/100 (pairs=${s%1e6}) fuelH=${mutant[22].toFixed(3)}`);
                    fs.writeFileSync('solution/learned_params_fwear.json', JSON.stringify({params: mutant, score: s}, null, 2));
                }
            }
        }
    }
}
main();
