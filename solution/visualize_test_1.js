const fs = require('fs');
const path = require('path');

const t = JSON.parse(fs.readFileSync('data/test_cases/inputs/test_001.json', 'utf8'));
const exp = JSON.parse(fs.readFileSync('data/test_cases/expected_outputs/test_001.json', 'utf8')).finishing_positions;
const strats = t.strategies;

const d = [];
for (let i = 1; i <= 20; i++) d.push({ id: strats[`pos${i}`].driver_id, grid: i, starting_tire: strats[`pos${i}`].starting_tire, pit_lap: strats[`pos${i}`].pit_stops[0].lap, to_tire: strats[`pos${i}`].pit_stops[0].to_tire, rank: exp.indexOf(strats[`pos${i}`].driver_id) + 1 });

d.sort((a,b) => a.rank - b.rank);
console.log('TEST_001 ACTUAL FINISHING ORDER WITH STRATEGIES');
console.log('Rank | Grid | Driver   | Strategy');
console.log('----------------------------------------------------');
d.forEach(r => {
    console.log(`${r.rank.toString().padStart(4)} | ${r.grid.toString().padStart(4)} | ${r.id.padEnd(8)} | ${r.starting_tire} (${r.pit_lap}) -> ${r.to_tire}`);
});
