const fs = require('fs');
const path = require('path');
const { simulate } = require('./race_simulator.js');
const id = '013';
const BASE = path.join(__dirname, '..');
const input = JSON.parse(fs.readFileSync(path.join(BASE, 'data/test_cases/inputs/test_' + id + '.json')));
const ec = JSON.parse(fs.readFileSync(path.join(BASE, 'data/test_cases/expected_outputs/test_' + id + '.json'))).finishing_positions;
const pc = simulate(input);
console.log('Pos | Exp (Start) | Pred (Start) | Match?');
for(let i=0; i<20; i++) {
    const k_e = Object.keys(input.strategies).find(k=>input.strategies[k].driver_id===ec[i]);
    const k_p = Object.keys(input.strategies).find(k=>input.strategies[k].driver_id===pc[i]);
    const es = input.strategies[k_e];
    const ps = input.strategies[k_p];
    console.log(`${i+1} | ${ec[i]} (${es.starting_tire}) | ${pc[i]} (${ps.starting_tire}) | ${ec[i]===pc[i]?'✓':'✗'}`);
}
