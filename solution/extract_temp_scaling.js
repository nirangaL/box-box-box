const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data', 'historical_races');
const races = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'races_00000-00999.json'), 'utf8'));

// Group by track (base_lap_time)
const byTrack = {};
for (const r of races) {
    const bt = r.race_config.base_lap_time.toFixed(1);
    if (!byTrack[bt]) byTrack[bt] = [];
    byTrack[bt].push(r);
}

for (const [bt, rs] of Object.entries(byTrack)) {
    if (rs.length > 5) {
        const temps = rs.map(r => r.race_config.track_temp);
        const minT = Math.min(...temps), maxT = Math.max(...temps);
        if (maxT - minT > 10) {
            console.log(`Track ${bt}: Temp Range ${minT} - ${maxT} (${rs.length} races)`);
        }
    }
}
