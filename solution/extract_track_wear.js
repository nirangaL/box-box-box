const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data', 'historical_races');
const races = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'races_00000-00999.json'), 'utf8'));

const results = [];
for (const r of races) {
    const track = r.race_config.track;
    for (const [pos, s] of Object.entries(r.strategies)) {
        if (s.pit_stops && s.pit_stops.length > 0) {
            results.push({ track, firstStintLen: s.pit_stops[0].lap, compound: s.starting_tire });
        }
    }
}

const stats = {};
for (const res of results) {
    const key = `${res.track}_${res.compound}`;
    if (!stats[key]) stats[key] = { sum: 0, count: 0 };
    stats[key].sum += res.firstStintLen;
    stats[key].count++;
}

console.log('Track\tCompound\tAvgStint');
for (const k of Object.keys(stats).sort()) {
    const [t, c] = k.split('_');
    const s = stats[k];
    console.log(`${t}\t${c}\t${(s.sum/s.count).toFixed(1)}`);
}
