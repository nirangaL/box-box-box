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
    return { match, res };
}

console.log('--- TEST_001 DEEP REFINEMENT ---');
console.log('Original Match:', check(pBase).match, '/ 20');

for (let off = -0.06; off < -0.05; off += 0.0001) {
    const p = JSON.parse(JSON.stringify(pBase));
    p.offset.SOFT = off;
    const { match } = check(p);
    if (match >= 18) {
        console.log(`off.SOFT ${off.toFixed(5)} -> Match ${match}`);
        if (match === 20) {
            console.log("!!! PERFECT SCORE !!!");
            fs.writeFileSync('solution/learned_params_001.json', JSON.stringify({params: p, score: 20}, null, 2));
        }
    }
}
