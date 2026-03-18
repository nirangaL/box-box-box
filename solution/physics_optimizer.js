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
        degrExp: { SOFT: arr[12], MEDIUM: arr[13], HARD: arr[14] },
        freshBonus: { SOFT: arr[15], MEDIUM: arr[16], HARD: arr[17] },
        shelfLife: { SOFT: arr[18], MEDIUM: arr[19], HARD: arr[20] },
        fuelPace: { SOFT: arr[21], MEDIUM: arr[22], HARD: arr[23] },
        fuelWear: { SOFT: arr[24], MEDIUM: arr[25], HARD: arr[26] },
        pitExitPenalty: arr[27],
        queuePenalty: arr[28],
        tempRef: arr[29]
    };
}

async function main() {
    console.log('--- POWER LAW ULTIMATE START ---');
    const cases = loadTestCases();
    let bp = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;
    let initialArr = [
        bp.offset.SOFT, bp.offset.MEDIUM, bp.offset.HARD,
        bp.tempCoeff.SOFT, bp.tempCoeff.MEDIUM, bp.tempCoeff.HARD,
        bp.degr1.SOFT, bp.degr1.MEDIUM, bp.degr1.HARD,
        bp.degr2.SOFT, bp.degr2.MEDIUM, bp.degr2.HARD,
        2.0, 2.0, 2.0, // degrExp
        bp.freshBonus.SOFT, bp.freshBonus.MEDIUM, bp.freshBonus.HARD,
        bp.shelfLife.SOFT, bp.shelfLife.MEDIUM, bp.shelfLife.HARD,
        0, 0, 0, // fuelPace
        0, 0, 0, // fuelWear
        bp.pitExitPenalty || -2, 0, 30 // queue, tempRef
    ];

    let popSize = 100;
    let population = Array.from({length: popSize}, () => initialArr.map((v, idx) => v + (Math.random()-0.5)*(idx >= 12 && idx <= 14 ? 0.5 : 0.01)));
    population[0] = [...initialArr];
    let scores = population.map((p, i) => {
        const s = getScore(pToObj(p), cases);
        if (i === 0) console.log(`Initial Score: ${Math.floor(s/1000000)}/100 (Pairs=${s%1000000})`);
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
                    if (idx >= 12 && idx <= 14) v = Math.max(1.0, Math.min(4.0, v)); // exp
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
                }
            }
        }
    }
}
main();
