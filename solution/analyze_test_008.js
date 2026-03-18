const fs = require('fs');
const path = require('path');
const { simulate } = require('./race_simulator.js');

const id = '008';
const input = JSON.parse(fs.readFileSync(`data/test_cases/inputs/test_${id}.json`, 'utf8'));
const expected = JSON.parse(fs.readFileSync(`data/test_cases/expected_outputs/test_${id}.json`, 'utf8')).finishing_positions;
const pred = simulate(input);

console.log(`Analyzing TEST_${id} (Track: ${input.race_config.track}, Temp: ${input.race_config.track_temp})`);
console.log('Rank | Expected | Predicted | Match? | Strategy Detail');
console.log('-------------------------------------------------------');
for (let i = 0; i < 20; i++) {
    const eId = expected[i];
    const pId = pred[i];
    const m = eId === pId ? '✓' : '✗';
    const s = input.strategies[Object.keys(input.strategies).find(k => input.strategies[k].driver_id === eId)];
    const stops = (s.pit_stops || []).map(st => st.lap + ':' + st.to_tire).join(',');
    console.log(`${(i+1).toString().padStart(4)} | ${eId.padEnd(8)} | ${pId.padEnd(9)} | ${m} | ${s.starting_tire} -> [${stops}]`);
}
