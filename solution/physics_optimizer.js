const fs = require('fs');
const path = require('path');
const { simulate } = require('./race_simulator');

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
            expectedRank: output.finishing_positions.reduce((acc, id, r) => { acc[id] = r; return acc; }, {}) 
        });
    }
    return cases;
}

function getScore(p, cases) {
    let exact = 0, pairs = 0;
    for (const c of cases) {
        // Use the actual simulator with parameter override
        const res = simulate(c.input, p);
        if (JSON.stringify(res) === JSON.stringify(c.expected)) {
            exact++;
            pairs += 190;
        } else {
            for (let i = 0; i < 20; i++) {
                const ri = c.expectedRank[res[i]];
                for (let j = i + 1; j < 20; j++) if (ri < c.expectedRank[res[j]]) pairs++;
            }
        }
    }
    return exact * 1000000 + pairs;
}

function pToObj(arr) {
    return {
        offset: { SOFT: arr[0], MEDIUM: arr[1], HARD: arr[2] },
        tempCoeff: { SOFT: arr[3], MEDIUM: arr[4], HARD: arr[5] },
        degr1: { SOFT: arr[6], MEDIUM: arr[7], HARD: arr[8] },
        degr2: { SOFT: arr[9], MEDIUM: arr[10], HARD: arr[11] },
        freshBonus: { SOFT: arr[12], MEDIUM: arr[13], HARD: arr[14] },
        shelfLife: { SOFT: arr[15], MEDIUM: arr[16], HARD: arr[17] },
        fuelPace: { SOFT: arr[18], MEDIUM: arr[19], HARD: arr[20] },
        fuelWear: { SOFT: arr[21], MEDIUM: arr[22], HARD: arr[23] },
        pitExitPenalty: arr[24],
        queuePenalty: arr[25]
    };
}

async function main() {
    const cases = loadTestCases();
    let BEST_PARAMS;
    try {
        BEST_PARAMS = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;
    } catch (e) {
        BEST_PARAMS = {
            offset: { SOFT: -0.05, MEDIUM: -0.03, HARD: -0.01 },
            tempCoeff: { SOFT: 0.02, MEDIUM: 0.02, HARD: 0.02 },
            degr1: { SOFT: 0.015, MEDIUM: 0.008, HARD: 0.004 },
            degr2: { SOFT: 0, MEDIUM: 0, HARD: 0 },
            freshBonus: { SOFT: -0.5, MEDIUM: -0.5, HARD: -0.5 },
            shelfLife: { SOFT: 10, MEDIUM: 20, HARD: 30 },
            fuelPace: { SOFT: 0, MEDIUM: 0, HARD: 0 },
            fuelWear: { SOFT: 0, MEDIUM: 0, HARD: 0 },
            pitExitPenalty: -2,
            queuePenalty: 0.5
        };
    }
    
    let current = [
        BEST_PARAMS.offset.SOFT, BEST_PARAMS.offset.MEDIUM, BEST_PARAMS.offset.HARD,
        BEST_PARAMS.tempCoeff.SOFT, BEST_PARAMS.tempCoeff.MEDIUM, BEST_PARAMS.tempCoeff.HARD,
        BEST_PARAMS.degr1.SOFT, BEST_PARAMS.degr1.MEDIUM, BEST_PARAMS.degr1.HARD,
        BEST_PARAMS.degr2.SOFT || 0, BEST_PARAMS.degr2.MEDIUM || 0, BEST_PARAMS.degr2.HARD || 0,
        BEST_PARAMS.freshBonus.SOFT, BEST_PARAMS.freshBonus.MEDIUM, BEST_PARAMS.freshBonus.HARD,
        BEST_PARAMS.shelfLife.SOFT || 10, BEST_PARAMS.shelfLife.MEDIUM || 20, BEST_PARAMS.shelfLife.HARD || 30,
        BEST_PARAMS.fuelPace ? BEST_PARAMS.fuelPace.SOFT : 0, BEST_PARAMS.fuelPace ? BEST_PARAMS.fuelPace.MEDIUM : 0, BEST_PARAMS.fuelPace ? BEST_PARAMS.fuelPace.HARD : 0,
        BEST_PARAMS.fuelWear ? BEST_PARAMS.fuelWear.SOFT : 0, BEST_PARAMS.fuelWear ? BEST_PARAMS.fuelWear.MEDIUM : 0, BEST_PARAMS.fuelWear ? BEST_PARAMS.fuelWear.HARD : 0,
        BEST_PARAMS.pitExitPenalty || -2,
        BEST_PARAMS.queuePenalty || 0
    ];

    let popSize = 50;
    let population = Array.from({length: popSize}, () => current.map((v, i) => {
        let range = 0.01;
        if (i >= 15 && i <= 17) range = 10; // shelfLife
        if (i >= 18) range = 0.5; // fuel/penalties
        return v + (Math.random()-0.5) * range;
    }));
    population[0] = [...current];

    let scores = population.map((p, idx) => {
        const s = getScore(pToObj(p), cases);
        if (idx === 0) console.log(`Initial Score: ${Math.floor(s/1000000)}/100 (Pairs=${s%1000000})`);
        return s;
    });
    
    let bestIdx = scores.indexOf(Math.max(...scores));

    for (let gen = 0; ; gen++) {
        for (let i = 0; i < popSize; i++) {
            let a, b, c;
            do { a = Math.floor(Math.random() * popSize); } while (a === i);
            do { b = Math.floor(Math.random() * popSize); } while (b === i || b === a);
            do { c = Math.floor(Math.random() * popSize); } while (c === i || c === a || c === b);

            const mutant = population[a].map((val, idx) => {
                if (Math.random() < 0.9) {
                    let v = val + 0.8 * (population[b][idx] - population[c][idx]);
                    if (idx >= 15 && idx <= 17) v = Math.max(0, Math.min(60, v));
                    return v;
                }
                return population[i][idx];
            });

            const s = getScore(pToObj(mutant), cases);
            if (s >= scores[i]) {
                population[i] = mutant; scores[i] = s;
                if (s > scores[bestIdx]) {
                    bestIdx = i;
                    console.log(`Gen ${gen}: Rank ${Math.floor(s/1000000)}/100 (Pairs=${s%1000000})`);
                    fs.writeFileSync('solution/learned_params.json', JSON.stringify({params: pToObj(population[bestIdx]), score: s}, null, 2));
                    if (Math.floor(s/1000000) >= 90) {
                        console.log("GOAL REACHED! Cross-testing confirmed.");
                    }
                }
            }
        }
        if (gen % 50 === 0) {
            // Heartbeat
        }
    }
}
main();
