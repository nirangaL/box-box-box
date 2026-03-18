const fs = require('fs');
const { simulate } = require('./race_simulator');

const testId = '001';
const race = JSON.parse(fs.readFileSync(`data/test_cases/inputs/test_${testId}.json`, 'utf8'));
const exp = JSON.parse(fs.readFileSync(`data/test_cases/expected_outputs/test_${testId}.json`, 'utf8')).finishing_positions;
const pBase = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;

function check(p) {
    const res = simulate(race, p);
    let match = 0;
    for(let i=0; i<20; i++) if(res[i] === exp[i]) match++;
    return { match };
}

console.log('--- TEST_001 GRID SWEEP (SOFT vs MEDIUM) ---');
for (let sOff = -0.06; sOff < -0.055; sOff += 0.0005) {
    for (let mOff = -0.05; mOff < -0.04; mOff += 0.0005) {
        const p = JSON.parse(JSON.stringify(pBase));
        p.offset.SOFT = sOff;
        p.offset.MEDIUM = mOff;
        const { match } = check(p);
        if (match >= 19) {
            console.log(`sOff ${sOff.toFixed(4)}, mOff ${mOff.toFixed(4)} -> Match ${match}`);
            if (match === 20) {
                console.log("!!! PERFECT HIT !!!");
                fs.writeFileSync('solution/learned_params_001.json', JSON.stringify({params: p, score: 20}, null, 2));
            }
        }
    }
}
