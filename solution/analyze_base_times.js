const fs = require('fs');
const path = require('path');

const DATA_DIR = 'data/historical_races';
const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));

const trackData = {};

for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    for (const r of data) {
        const rc = r.race_config;
        if (!trackData[rc.track]) trackData[rc.track] = [];
        trackData[rc.track].push({
            base: rc.base_lap_time,
            laps: rc.total_laps,
            temp: rc.track_temp
        });
    }
}

for (const track in trackData) {
    const entries = trackData[track];
    const uniqueBase = [...new Set(entries.map(e => e.base))];
    console.log(`Track: ${track}`);
    console.log(`  Unique Base Times: ${uniqueBase.sort().join(', ')}`);
    // Check Correlation between Base and Laps
    if (entries.length > 0) {
        const first = entries[0];
        const allSame = entries.every(e => e.base === first.base && e.laps === first.laps);
        if (!allSame) {
            console.log(`  VARIES! e.g. ${entries[0].base} @ ${entries[0].laps} laps vs ${entries[entries.length-1].base} @ ${entries[entries.length-1].laps} laps`);
        }
    }
}
