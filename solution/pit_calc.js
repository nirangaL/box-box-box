const fs = require('fs');
const path = require('path');

const DATA_DIR = 'data/historical_races';
const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));

let totalCost = 0, count = 0;

for (const f of files) {
    const races = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    for (const r of races) {
        const rc = r.race_config, base = rc.base_lap_time, pit = rc.pit_lane_time;
        const s = r.strategies, pos = r.finishing_positions;
        const drivers = Object.keys(s);
        for (let i = 0; i < drivers.length; i++) {
            for (let j = i + 1; j < drivers.length; j++) {
                const s1 = s[drivers[i]], s2 = s[drivers[j]];
                if (!s1.pit_stops || !s2.pit_stops) continue;
                if (s1.pit_stops.length === 1 && s2.pit_stops.length === 2) {
                    // Check if total compounding is same (approximate for now)
                    if (s1.starting_tire === s2.starting_tire && s1.pit_stops[0].to_tire === s2.pit_stops[1].to_tire) {
                        // Same compound sequence.
                        // We assume they finished close in time if they are adjacent in ranks.
                        const r1 = pos.indexOf(s1.driver_id), r2 = pos.indexOf(s2.driver_id);
                        if (Math.abs(r1 - r2) === 1) {
                            // If they are adjacent, the time difference is small (~0.5s avg).
                            // So Cost(2nd pit) approx distance between them in laps vs wear...
                            // This is complex. Let's just find EXACT strategy matches first.
                        }
                    }
                }
            }
        }
    }
}
console.log('Searching for identical sequences...');
