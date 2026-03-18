const fs = require('fs');
const { simulate } = require('./race_simulator.js');

const sl = JSON.parse(fs.readFileSync('solution/learned_params.json')).params;
const cases = [];
const ids = ['001','008','013','014','024']; // Focus on failing
for (const id of ids) {
    const input = JSON.parse(fs.readFileSync(`data/test_cases/inputs/test_${id}.json`));
    const output = JSON.parse(fs.readFileSync(`data/test_cases/expected_outputs/test_${id}.json`));
    cases.push({ input, exp: output.finishing_positions });
}

for (let d1 = 0; d1 < 0.01; d1 += 0.002) {
    for (let d2 = 0; d2 < 0.0005; d2 += 0.0001) {
        let p = JSON.parse(JSON.stringify(sl));
        p.degr1.HARD = d1; p.degr2.HARD = d2;
        let ok = 0;
        for (const c of cases) {
            if (JSON.stringify(simulate(c.input, p)) === JSON.stringify(c.exp)) ok++;
        }
        if (ok > 0) console.log(`d1=${d1} d2=${d2} Passes: ${ok}/5`);
    }
}
