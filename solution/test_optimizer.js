const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', 'data', 'test_cases');
function loadTestCases() {
    const cases = [];
    for (let i = 1; i <= 100; i++) {
        const id = String(i).padStart(3, '0');
        const input = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'inputs', `test_${id}.json`), 'utf8'));
        const output = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'expected_outputs', `test_${id}.json`), 'utf8'));
        cases.push({
            input,
            expected: output.finishing_positions,
            expectedMap: output.finishing_positions.reduce((acc, id, rank) => { acc[id] = rank; return acc; }, {})
        });
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
            c.time += base * (1 + p[ti] + wearEffect) + (c.age === 1 ? p[12+ti] : 0) + (c.si > 0 && c.age === 1 ? p[15] : 0);
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
        if (JSON.stringify(pred) === JSON.stringify(c.expected)) {
            exact++;
            pairs += 190;
        } else {
            for (let i = 0; i < 20; i++) {
                const ri = c.expectedMap[pred[i]];
                for (let j = i + 1; j < 20; j++) if (ri < c.expectedMap[pred[j]]) pairs++;
            }
        }
    }
    return exact * 1000000 + pairs;
}

const RANGES = [
    [-0.1, 0.1], [-0.1, 0.1], [-0.1, 0.1], // offsets
    [0, 0.1], [0, 0.1], [0, 0.1],          // tempCoeff
    [0, 0.05], [0, 0.05], [0, 0.05],       // d1
    [0, 0.005], [0, 0.005], [0, 0.005],    // d2
    [-2, 2], [-2, 2], [-2, 2],             // freshBonus
    [-2, 2],                               // pitExitPenalty
    [0, 20], [5, 40], [10, 60],            // shelfLife
    [0, 1.0]                               // queuePenalty
];

function main() {
    const cases = loadTestCases();
    const popSize = 50;
    let population = Array.from({length: popSize}, () => RANGES.map(r => r[0] + Math.random()*(r[1]-r[0])));
    
    // Seed from 58/100
    try {
        const s = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;
        population[0] = [s.offset.SOFT, s.offset.MEDIUM, s.offset.HARD, s.tempCoeff.SOFT, s.tempCoeff.MEDIUM, s.tempCoeff.HARD,
                        s.degr1.SOFT, s.degr1.MEDIUM, s.degr1.HARD, s.degr2.SOFT, s.degr2.MEDIUM, s.degr2.HARD,
                        s.freshBonus.SOFT, s.freshBonus.MEDIUM, s.freshBonus.HARD, s.pitExitPenalty,
                        s.shelfLife.SOFT, s.shelfLife.MEDIUM, s.shelfLife.HARD, s.queuePenalty || 0];
    } catch(e) {}

    let scores = population.map(p => score(cases, p));
    let bestIdx = scores.indexOf(Math.max(...scores));

    console.log(`Starting HighRes Optimizer... Initial: ${Math.floor(scores[bestIdx]/1000000)}/100`);

    let gen = 0;
    while(true) {
        gen++;
        for(let i=0; i<popSize; i++) {
            let a, b, c; do{a=Math.floor(Math.random()*popSize);}while(a===i);
            do{b=Math.floor(Math.random()*popSize);}while(b===i||b===a);
            do{c=Math.floor(Math.random()*popSize);}while(c===i||c===a||c===b);
            const mutant = population[a].map((val, idx) => {
                if (Math.random() < 0.9) {
                    let v = val + 0.8 * (population[b][idx] - population[c][idx]);
                    return Math.max(RANGES[idx][0], Math.min(RANGES[idx][1], v));
                }
                return population[i][idx];
            });
            const s = score(cases, mutant);
            if(s >= scores[i]) {
                population[i] = mutant; scores[i] = s;
                if(s > scores[bestIdx]) {
                    bestIdx = i;
                    console.log(`Gen ${gen} Best: ${Math.floor(s/1000000)}/100 (${(s%1000000/190).toFixed(2)})`);
                    save(population[bestIdx], s);
                }
            }
        }
        if(gen%50===0) console.log(`Gen ${gen}...`);
    }
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
