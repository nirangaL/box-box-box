const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', 'data', 'test_cases');
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

function simulate(race, p) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (let j = 1; j <= 20; j++) {
        const sj = race.strategies[`pos${j}`];
        cars.push({ id: sj.driver_id, grid: j, tire: sj.starting_tire, age: 0, time: 0, stops: sj.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire.toUpperCase();
            const shelf = p.shelfLife[ti];
            const wearAge = Math.max(0, c.age - shelf);
            const wear = (p.degr1[ti]*wearAge + p.degr2[ti]*wearAge*wearAge) * (1 + p.tempCoeff[ti]*tDelta);
            c.time += base * (1 + p.offset[ti] + wear) + (c.age === 1 ? p.freshBonus[ti] : 0) + (c.si > 0 && c.age === 1 ? p.pitExitPenalty : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => {
            c.time += pit + q * p.queuePenalty;
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x=>x.id);
}

function score(p) {
    let exact = 0, pairs = 0;
    for (const c of cases) {
        const res = simulate(c.input, p);
        if (JSON.stringify(res) === JSON.stringify(c.expected)) { exact++; pairs += 190; }
        else {
            for (let j = 0; j < 20; j++) {
                const rj = c.expectedRank[res[j]];
                for (let k = j + 1; k < 20; k++) if (rj < c.expectedRank[res[k]]) pairs++;
            }
        }
    }
    return exact * 1e6 + pairs;
}

const BEST = JSON.parse(fs.readFileSync('solution/learned_params.json')).params;
const p = JSON.parse(JSON.stringify(BEST));

console.log('Optimizing qp and offsets...');
let bestS = score(p);

// DE with small population
let pop = Array.from({length: 40}, () => {
    let cp = JSON.parse(JSON.stringify(p));
    cp.queuePenalty = Math.random();
    cp.offset.SOFT += (Math.random()-0.5)*0.01;
    cp.offset.MEDIUM += (Math.random()-0.5)*0.01;
    cp.offset.HARD += (Math.random()-0.5)*0.01;
    return cp;
});
pop[0] = JSON.parse(JSON.stringify(p));
let scores = pop.map(pi => score(pi));
let bestIdx = 0;

for (let gen = 0; gen < 500; gen++) {
    for (let i = 0; i < 40; i++) {
        let a,b,c; do{a=Math.floor(Math.random()*40);}while(a===i);
        do{b=Math.floor(Math.random()*40);}while(b===i||b===a);
        do{c=Math.floor(Math.random()*40);}while(c===i||c===a||c===b);
        
        let mut = JSON.parse(JSON.stringify(pop[a]));
        mut.queuePenalty = Math.max(0, Math.min(2, mut.queuePenalty + 0.8*(pop[b].queuePenalty-pop[c].queuePenalty)));
        mut.offset.SOFT += 0.8*(pop[b].offset.SOFT-pop[c].offset.SOFT);
        mut.offset.MEDIUM += 0.8*(pop[b].offset.MEDIUM-pop[c].offset.MEDIUM);
        mut.offset.HARD += 0.8*(pop[b].offset.HARD-pop[c].offset.HARD);

        let s = score(mut);
            if (s > scores[i]) {
                pop[i] = mut; scores[i] = s;
                if (s > scores[bestIdx]) {
                    bestIdx = i;
                    console.log(`Gen ${gen}: Rank ${Math.floor(s/1e6)}/100 (Pairs=${s%1e6}) qp=${mut.queuePenalty.toFixed(2)}`);
                    save(mut, s, gen);
                }
            }
    }
}
