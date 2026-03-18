const fs = require('fs');
const { simulate } = require('./race_simulator');

const cases = JSON.parse(fs.readFileSync('data/test_cases/inputs/test_001.json', 'utf8')); // Just one for now

async function main() {
    let bestScore = 58;
    for (let fb = 0.001; fb <= 0.05; fb += 0.005) {
        // I'll modify race_simulator to use this bonus
    }
}
