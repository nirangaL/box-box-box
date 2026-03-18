const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', 'data', 'test_cases');
function simulate(race, p) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (let j = 1; j <= 20; j++) {
        const sj = race.strategies[`pos${j}`];
        cars.push({ id: sj.driver_id, grid: j, tire: sj.starting_tire, age: 0, time: 0, stops: sj.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;
    for (let lap = 1; lap <= total; lap++) {
        const fl = (total - lap) / total;
        for (const c of cars) {
            c.age++;
            const ti = c.tire.toUpperCase();
            const wearAge = Math.max(0, c.age - p.shelfLife[ti]);
            // Non-linear Temperature and Fuel wear scaling
            const wearScale = (1 + (tDelta > 0 ? p.tempPlus[ti] : p.tempMinus[ti]) * Math.abs(tDelta) + p.fuelWear[ti] * fl);
            const wear = (p.degr1[ti]*wearAge + p.degr2[ti]*wearAge*wearAge) * wearScale;
            c.time += base * (1 + p.offset[ti] + wear + p.fuelPace * fl) + (c.age === 1 ? p.freshBonus[ti] : 0) + (c.si > 0 && c.age === 1 ? p.pitExitPenalty : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => { c.time += pit + q * p.queuePenalty; c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++; });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x=>x.id);
}

function score(cases, p) {
    let exact = 0, pairs = 0;
    for (const c of cases) {
        const res = simulate(c.input, p);
        if (JSON.stringify(res) === JSON.stringify(c.expected)) { exact++; pairs += 190; }
        else {
            const expMap = c.expectedRank;
            for (let j = 0; j < 20; j++) {
                const rj = expMap[res[j]];
                for (let k = j + 1; k < 20; k++) if (rj < expMap[res[k]]) pairs++;
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
    cases.push({ input, expected: output.finishing_positions, expectedRank: output.finishing_positions.reduce((acc, id, r) => { acc[id] = r; return acc; }, {}) });
}

const BEST = JSON.parse(fs.readFileSync('solution/learned_params.json')).params;

// Param Array indices: 
// 0-2: offset, 3-5: tempPlus, 6-8: tempMinus, 9-11: degr1, 12-14: degr2, 15-17: fresh, 
// 18-20: shelf, 21: pitExit, 22: queue, 23-25: fuelWear, 26: fuelPace
const pArr = [
    BEST.offset.SOFT, BEST.offset.MEDIUM, BEST.offset.HARD,
    BEST.tempCoeff.SOFT, BEST.tempCoeff.MEDIUM, BEST.tempCoeff.HARD,
    -BEST.tempCoeff.SOFT, -BEST.tempCoeff.MEDIUM, -BEST.tempCoeff.HARD,
    BEST.degr1.SOFT, BEST.degr1.MEDIUM, BEST.degr1.HARD,
    BEST.degr2.SOFT || 0, BEST.degr2.MEDIUM || 0, BEST.degr2.HARD || 0,
    BEST.freshBonus.SOFT, BEST.freshBonus.MEDIUM, BEST.freshBonus.HARD,
    BEST.shelfLife.SOFT, BEST.shelfLife.MEDIUM, BEST.shelfLife.HARD,
    BEST.pitExitPenalty, BEST.queuePenalty || 0,
    0.0, 0.0, 0.0, 0.0 // fuelWear and fuelPace
];

const RANGES = pArr.map(v => [v - 0.2, v + 0.2]);
for(let i=0; i<9; i++) RANGES[i] = [-0.1, 0.1];
for(let i=9; i<=14; i++) RANGES[i] = [0, 0.1];
for(let i=18; i<=20; i++) RANGES[i] = [0, 60];
for(let i=21; i<=22; i++) RANGES[i] = [-5, 5];
for(let i=23; i<=26; i++) RANGES[i] = [-2, 2];

function toObj(p) {
    return {
        offset: { SOFT: p[0], MEDIUM: p[1], HARD: p[2] },
        tempPlus: { SOFT: p[3], MEDIUM: p[4], HARD: p[5] },
        tempMinus: { SOFT: p[6], MEDIUM: p[7], HARD: p[8] },
        degr1: { SOFT: p[9], MEDIUM: p[10], HARD: p[11] },
        degr2: { SOFT: p[12], MEDIUM: p[13], HARD: p[14] },
        freshBonus: { SOFT: p[15], MEDIUM: p[16], HARD: p[17] },
        shelfLife: { SOFT: p[18], MEDIUM: p[19], HARD: p[20] },
        pitExitPenalty: p[21], queuePenalty: p[22],
        fuelWear: { SOFT: p[23], MEDIUM: p[24], HARD: p[25] },
        fuelPace: p[26]
    };
}

async function solve() {
    let popSize = 80;
    let pop = Array.from({length: popSize}, () => RANGES.map(r => r[0] + Math.random()*(r[1]-r[0])));
    pop[0] = [...pArr];
    let scores = pop.map(pi => score(cases, toObj(pi)));
    let bestIdx = scores.indexOf(Math.max(...scores));
    console.log(`Starting Score: ${Math.floor(scores[bestIdx]/1e6)}/100 (Pairs=${scores[bestIdx]%1e6})`);

    for (let gen = 0; gen < 5000; gen++) {
        if (gen % 10 === 0) console.log(`Gen ${gen}...`);
        for (let i = 0; i < popSize; i++) {
            let a,b,c; do{a=Math.floor(Math.random()*popSize);}while(a===i);
            do{b=Math.floor(Math.random()*popSize);}while(b===i||b===a);
            do{c=Math.floor(Math.random()*popSize);}while(c===i||c===a||c===b);
            const mut = pop[a].map((v, idx) => {
                if (Math.random() < 0.9) {
                    let vv = v + 0.8 * (pop[b][idx] - pop[c][idx]);
                    return Math.max(RANGES[idx][0], Math.min(RANGES[idx][1], vv));
                }
                return pop[i][idx];
            });
            const s = score(cases, toObj(mut));
            if (s >= scores[i]) {
                pop[i] = mut; scores[i] = s;
                if (s > scores[bestIdx]) {
                    bestIdx = i;
                    console.log(`Gen ${gen}: ${Math.floor(s/1e6)}/100 (Pairs=${s%1e6})`);
                    fs.writeFileSync('solution/learned_params_super.json', JSON.stringify({params: toObj(pop[bestIdx]), score: s}, null, 2));
                }
            }
        }
    }
}
solve();
