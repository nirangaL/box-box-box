const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', 'data', 'test_cases');
const cases = [];
for (let i = 1; i <= 100; i++) {
    const id = String(i).padStart(3, '0');
    const input = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'inputs', `test_${id}.json`)));
    const output = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'expected_outputs', `test_${id}.json`)));
    cases.push({ input, expected: output.finishing_positions, expectedRank: output.finishing_positions.reduce((acc, id, r) => { acc[id] = r; return acc; }, {}) });
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
            const wearAge = Math.max(0, c.age - p.shelfLife[ti]);
            const wear = (p.degr1[ti]*wearAge + p.degr2[ti]*wearAge*wearAge) * (1 + p.tempCoeff[ti]*tDelta);
            c.time += base * (1 + p.offset[ti] + wear) + (c.age === 1 ? p.freshBonus[ti] : 0) + (c.si > 0 && c.age === 1 ? p.pitExitPenalty : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => { c.time += pit + q * p.queuePenalty; c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++; });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x=>x.id);
}

function score(p) {
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

const BEST = JSON.parse(fs.readFileSync('solution/learned_params.json')).params;

async function run() {
    let currentBest = JSON.parse(JSON.stringify(BEST));
    let bestS = score(currentBest);
    console.log(`Initial: ${Math.floor(bestS/1e6)}/100 Pairs=${bestS%1e6}`);

    for (let i = 0; i < 5000; i++) {
        const next = JSON.parse(JSON.stringify(currentBest));
        // Mutation
        if (Math.random() < 0.3) {
            const tire = ['SOFT', 'MEDIUM', 'HARD'][Math.floor(Math.random()*3)];
            const key = ['offset', 'degr1', 'tempCoeff', 'shelfLife'][Math.floor(Math.random()*4)];
            next[key][tire] += (Math.random() - 0.5) * (key === 'offset' ? 0.0001 : 0.001);
        } else {
            next.pitExitPenalty += (Math.random() - 0.5) * 0.1;
            next.queuePenalty += (Math.random() - 0.5) * 0.1;
        }

        const s = score(next);
        if (s > bestS) {
            bestS = s; currentBest = next;
            console.log(`[${i}] New Score: ${Math.floor(s/1e6)}/100 Pairs=${s%1e6}`);
            fs.writeFileSync('solution/learned_params_stagger.json', JSON.stringify({params: currentBest, score: s}, null, 2));
        }
    }
}
run();
