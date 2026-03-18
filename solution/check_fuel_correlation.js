const fs = require('fs');
const path = require('path');

const DATA_DIR = 'data/historical_races';
const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));

const trackData = {};

for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    for (const r of data) {
        const t = r.race_config.track;
        if (!trackData[t]) trackData[t] = [];
        trackData[t].push({ laps: r.race_config.total_laps, base: r.race_config.base_lap_time });
    }
}

for (const track in trackData) {
    const d = trackData[track].slice(0, 100);
    // Sort by laps
    d.sort((a,b)=>a.laps-b.laps);
    console.log(`\n--- ${track} ---`);
    d.forEach(x => {
        console.log(`Laps ${x.laps}: Base ${x.base}`);
    });
}
