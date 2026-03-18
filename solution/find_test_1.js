const fs = require('fs');
const path = require('path');

const DATA_DIR = 'data/historical_races';
const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));

let found = 0;
for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    for (const r of data) {
        const rc = r.race_config;
        if (rc.track_temp === 30 && rc.total_laps === 66 && rc.base_lap_time === 80) {
            console.log(`MATCH FOUND in ${f}: Race ${r.race_id}`);
            console.log('Top 5 Finishers:', JSON.stringify(r.finishing_positions.slice(0, 5)));
            found++;
        }
    }
}
if (found === 0) console.log('No exact match for TEST_001 in historical data.');
else console.log(`Found ${found} matches.`);
