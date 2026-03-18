const fs = require('fs');
const path = require('path');

const DATA_DIR = 'data/historical_races';
const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));

const track_pit_costs = {};

for (const f of files) {
    const races = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    for (const r of races) {
        const strats = r.strategies;
        const track = r.race_config.track;
        if (!track_pit_costs[track]) track_pit_costs[track] = [];
        
        // Find a 1-stop vs 2-stop strategy where the overlap is large
        const posKeys = Object.keys(strats);
        for (let i = 0; i < posKeys.length; i++) {
            for (let j = i+1; j < posKeys.length; j++) {
                const s1 = strats[posKeys[i]], s2 = strats[posKeys[j]];
                if (!s1.pit_stops || !s2.pit_stops) continue;
                if (s1.starting_tire === s2.starting_tire && s1.pit_stops.length === 1 && s2.pit_stops.length === 2) {
                    // This is a candidate for measuring one pit stop cost
                    // But we need the finish ranks
                }
            }
        }
    }
}
