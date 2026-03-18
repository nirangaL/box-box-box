const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data', 'historical_races');
function loadRaces(num) {
    let races = [];
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort();
    for (let i = 0; i < Math.min(num, files.length); i++) {
        races = races.concat(JSON.parse(fs.readFileSync(path.join(DATA_DIR, files[i]), 'utf8')));
    }
    return races;
}

function simulate(race, p) {
    const rc = race.race_config, base = rc.base_lap_time, temp = rc.track_temp, pit = rc.pit_lane_time, total = rc.total_laps;
    const cars = [];
    for (const [pos, s] of Object.entries(race.strategies)) {
        cars.push({ id: s.driver_id, grid: parseInt(pos.slice(3)), tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;
    for (let lap = 1; lap <= total; lap++) {
        const fuel = (total - lap) / total;
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            const wearAge = Math.max(0, c.age - p[16 + ti]);
            // wearScale = 1 + temp_effect + fuel_effect
            const wearScale = (1 + p[3 + ti] * tDelta + p[20 + ti] * fuel);
            const wearEffect = (p[6 + ti] * wearAge + p[9 + ti] * wearAge * wearAge) * wearScale;
            // lapTime = base * (1 + offset + wearEffect + fuel*fuelFactor)
            let lp = base * (1 + p[ti] + wearEffect + fuel * p[23]) + (c.age === 1 ? p[12 + ti] : 0) + (c.si > 0 && c.age === 1 ? p[15] : 0);
            c.time += lp;
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

function score(races, p) {
    let exact = 0, pairs = 0, total = 0;
    for (const r of races) {
        const pred = simulate(r, p);
        const truth = r.finishing_positions;
        if (JSON.stringify(pred) === JSON.stringify(truth)) exact++;
        
        const tMap = {}; truth.forEach((id, rank) => tMap[id] = rank);
        for (let i = 0; i < 20; i++) {
            const ri = tMap[pred[i]];
            for (let j = i + 1; j < 20; j++) {
                total++;
                if (ri < tMap[pred[j]]) pairs++;
            }
        }
    }
    return exact * 1000 + (pairs / total);
}

async function main() {
    const races = loadRaces(2); // 2000 races for speed
    console.log(`Loaded ${races.length} races`);
    const BEST = JSON.parse(fs.readFileSync('solution/learned_params.json')).params;
    
    // Seed p (24 params)
    let p = [
        BEST.offset.SOFT, BEST.offset.MEDIUM, BEST.offset.HARD,
        BEST.tempCoeff.SOFT, BEST.tempCoeff.MEDIUM, BEST.tempCoeff.HARD,
        BEST.degr1.SOFT, BEST.degr1.MEDIUM, BEST.degr1.HARD,
        BEST.degr2.SOFT || 0, BEST.degr2.MEDIUM || 0, BEST.degr2.HARD || 0,
        BEST.freshBonus.SOFT, BEST.freshBonus.MEDIUM, BEST.freshBonus.HARD,
        BEST.pitExitPenalty,
        BEST.shelfLife.SOFT, BEST.shelfLife.MEDIUM, BEST.shelfLife.HARD,
        BEST.queuePenalty || 0, // p[19]
        0.0, 0.0, 0.0, // p[20,21,22] fuelWear
        0.0 // p[23] fuelPace
    ];

    const RANGES = p.map((v, i) => [v - 0.2, v + 0.2]); // wide for new params
    for(let i=0; i<3; i++) RANGES[i] = [-0.1, 0.1];
    for(let i=3; i<6; i++) RANGES[i] = [0, 0.1];
    for(let i=20; i<=22; i++) RANGES[i] = [0, 2.0]; // fuelWear
    RANGES[23] = [0, 0.1]; // fuelPace
    
    const popSize = 40;
    let pop = Array.from({length: popSize}, () => RANGES.map(r => r[0] + Math.random()*(r[1]-r[0])));
    pop[0] = [...p];

    let currentScores = pop.map(pi => score(races, pi));
    let bestIdx = currentScores.indexOf(Math.max(...currentScores));
    console.log(`Initial Score: ${currentScores[bestIdx].toFixed(4)}`);

    for (let gen = 0; gen < 1000; gen++) {
        for (let i = 0; i < popSize; i++) {
            let a,b,c;
            do{a=Math.floor(Math.random()*popSize);}while(a===i);
            do{b=Math.floor(Math.random()*popSize);}while(b===i||b===a);
            do{c=Math.floor(Math.random()*popSize);}while(c===i||c===a||c===b);
            
            const mutant = pop[a].map((val, idx) => {
                if (Math.random() < 0.9) {
                    let v = val + 0.8 * (pop[b][idx] - pop[c][idx]);
                    return Math.max(RANGES[idx][0], Math.min(RANGES[idx][1], v));
                }
                return pop[i][idx];
            });
            const s = score(races, mutant);
            if (s >= currentScores[i]) {
                pop[i] = mutant; currentScores[i] = s;
                if (s > currentScores[bestIdx]) {
                    bestIdx = i;
                    console.log(`Gen ${gen}: Best Score ${s.toFixed(4)} (Exact: ${Math.floor(s/1000)})`);
                    save(pop[bestIdx], s);
                }
            }
        }
    }
}

function save(p, s) {
    const out = {
        params: {
            offset: { SOFT: p[0], MEDIUM: p[1], HARD: p[2] },
            tempCoeff: { SOFT: p[3], MEDIUM: p[4], HARD: p[5] },
            degr1: { SOFT: p[6], MEDIUM: p[7], HARD: p[8] },
            degr2: { SOFT: p[9], MEDIUM: p[10], HARD: p[11] },
            freshBonus: { SOFT: p[12], MEDIUM: p[13], HARD: p[14] },
            pitExitPenalty: p[15],
            shelfLife: { SOFT: p[16], MEDIUM: p[17], HARD: p[18] },
            queuePenalty: p[19],
            fuelWear: { SOFT: p[20], MEDIUM: p[21], HARD: p[22] },
            fuelFactor: p[23]
        },
        score: s
    };
    fs.writeFileSync('solution/learned_params_history.json', JSON.stringify(out, null, 2));
}

main();
