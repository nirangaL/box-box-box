const fs = require('fs');
const path = require('path');

const DATA_DIR = 'data/historical_races';
const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));

let total = 0;
let drift = 0;

for (const f of files) {
    const races = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    for (const r of races) {
        const s1 = r.strategies.pos1;
        const s2 = r.strategies.pos2;
        if (s1.starting_tire === s2.starting_tire && JSON.stringify(s1.pit_stops) === JSON.stringify(s2.pit_stops)) {
            // Identical strategy.
            // P1 should win if there is NO drift.
            // If P2 wins, drift exists.
            total++;
            if (r.finishing_positions[0] === s2.driver_id) drift++;
        }
    }
}

console.log(`Total Identical Strategy Pair (P1/P2): ${total}`);
console.log(`P2 Beat P1: ${drift} (${(drift/total*100).toFixed(1)}%)`);
