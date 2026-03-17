const fs = require('fs');
const path = require('path');
const { simulate } = require('./race_simulator.js');

const id = '001';
const input = JSON.parse(fs.readFileSync(`data/test_cases/inputs/test_${id}.json`, 'utf8'));
const expected = JSON.parse(fs.readFileSync(`data/test_cases/expected_outputs/test_${id}.json`, 'utf8')).finishing_positions;

const pred = simulate(input);

console.log('Comparison for TEST_001');
console.log('Rank | Expected | Predicted | Match?');
for (let i = 0; i < 20; i++) {
  const match = expected[i] === pred[i] ? '✓' : '✗';
  console.log(`${(i+1).toString().padStart(4)} | ${expected[i].padEnd(8)} | ${pred[i].padEnd(9)} | ${match}`);
}
