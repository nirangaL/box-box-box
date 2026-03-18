const fs = require('fs');
const test1 = JSON.parse(fs.readFileSync('data/test_cases/inputs/test_001.json', 'utf8'));
const expected = JSON.parse(fs.readFileSync('data/test_cases/expected_outputs/test_001.json', 'utf8'));

console.log('RANK | ID | POS | START | STOPS');
expected.finishing_positions.forEach((id, rank) => {
  const posKey = Object.keys(test1.strategies).find(k => test1.strategies[k].driver_id === id);
  const strat = test1.strategies[posKey];
  const stops = (strat.pit_stops || []).map(s => s.lap + ':' + s.to_tire).join(', ');
  console.log(`${rank+1} | ${id} | ${posKey} | ${strat.starting_tire} | ${stops}`);
});
