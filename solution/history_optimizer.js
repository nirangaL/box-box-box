const fs = require('fs');
const path = require('path');
const { simulate } = require('./race_simulator');

function loadHistory(nFiles) {
    let races = [];
    const dir = 'data/historical_races';
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
    for (let i = 0; i < Math.min(nFiles, files.length); i++) {
        races = races.concat(JSON.parse(fs.readFileSync(path.join(dir, files[i]), 'utf8')));
    }
    return races;
}

function getScore(p, data) {
    let exact = 0;
    for (const r of data) {
        if (JSON.stringify(simulate(r, p)) === JSON.stringify(r.finishing_positions)) exact++;
    }
    return exact;
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
        queuePenalty: arr[25],
        tempRef: arr[26]
    };
}

async function main() {
    console.log('--- DEEP HISTORY MINING START ---');
    const data = loadHistory(2);
    let pObj = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;
    let initialArr = [
        pObj.offset.SOFT, pObj.offset.MEDIUM, pObj.offset.HARD,
        pObj.tempCoeff.SOFT, pObj.tempCoeff.MEDIUM, pObj.tempCoeff.HARD,
        pObj.degr1.SOFT, pObj.degr1.MEDIUM, pObj.degr1.HARD,
        pObj.degr2.SOFT || 0, pObj.degr2.MEDIUM || 0, pObj.degr2.HARD || 0,
        pObj.freshBonus.SOFT, pObj.freshBonus.MEDIUM, pObj.freshBonus.HARD,
        pObj.shelfLife.SOFT, pObj.shelfLife.MEDIUM, pObj.shelfLife.HARD,
        pObj.fuelPace ? pObj.fuelPace.SOFT : 0, pObj.fuelPace ? pObj.fuelPace.MEDIUM : 0, pObj.fuelPace ? pObj.fuelPace.HARD : 0,
        pObj.fuelWear ? pObj.fuelWear.SOFT : 0, pObj.fuelWear ? pObj.fuelWear.MEDIUM : 0, pObj.fuelWear ? pObj.fuelWear.HARD : 0,
        pObj.pitExitPenalty || -2, pObj.queuePenalty || 0, pObj.tempRef || 30
    ];

    let popSize = 40;
    let population = Array.from({length: popSize}, () => initialArr.map(v => v + (Math.random()-0.5)*0.01));
    population[0] = [...initialArr];

    let scores = population.map((p, i) => {
        const s = getScore(pToObj(p), data);
        if(i === 0) console.log(`Initial Score: ${s}/${data.length}`);
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
                    return v;
                }
                return population[i][idx];
            });

            const s = getScore(pToObj(mutant), data);
            if (s >= scores[i]) {
                population[i] = mutant; scores[i] = s;
                if (s > scores[bestIdx]) {
                    bestIdx = i;
                    console.log(`Gen ${gen}: Rank ${s}/${data.length}`);
                    fs.writeFileSync('solution/learned_params.json', JSON.stringify({params: pToObj(population[bestIdx]), score: s}, null, 2));
                }
            }
        }
    }
}
main();
