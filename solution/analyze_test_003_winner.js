const fs = require('fs');
const id = '003';
const input = JSON.parse(fs.readFileSync(`data/test_cases/inputs/test_${id}.json`, 'utf8'));
const expected = JSON.parse(fs.readFileSync(`data/test_cases/expected_outputs/test_${id}.json`, 'utf8')).finishing_positions;
const idToGrid = {};
for (let i = 1; i <= 20; i++) idToGrid[input.strategies[`pos${i}`].driver_id] = i;

console.log('RANK | GRID | STRATEGY');
for (let i = 0; i < 5; i++) {
    const dId = expected[i];
    const grid = idToGrid[dId];
    const s = input.strategies[`pos${grid}`];
    const stops = (s.pit_stops || []).map(st => st.lap + ':' + st.to_tire).join(',');
    console.log(`${i+1} | P${grid.toString().padStart(2)} | ${s.starting_tire} -> [${stops}]`);
}
