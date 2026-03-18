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
        trackData[t].push({ base: r.race_config.base_lap_time, temp: r.race_config.track_temp });
    }
}

for (const track in trackData) {
    const d = trackData[track].slice(0, 50);
    d.sort((a,b)=>a.temp-b.temp);
    console.log(`\n--- ${track} ---`);
    d.forEach(x => {
        console.log(`Temp ${x.temp}: Base ${x.base}`);
    });
}
