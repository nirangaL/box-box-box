const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data', 'historical_races');
const races = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'races_00000-00999.json'), 'utf8'));

const results = [];
for (const r of races) {
    const temp = r.race_config.track_temp;
    for (const [pos, s] of Object.entries(r.strategies)) {
        if (s.pit_stops && s.pit_stops.length > 0) {
            const firstStintLen = s.pit_stops[0].lap;
            const compound = s.starting_tire;
            results.push({ temp, firstStintLen, compound });
        }
    }
}

// Average stint length by temp range and compound
const stats = {};
for (const res of results) {
    const bin = Math.floor(res.temp / 5) * 5;
    const key = `${bin}_${res.compound}`;
    if (!stats[key]) stats[key] = { sum: 0, count: 0 };
    stats[key].sum += res.firstStintLen;
    stats[key].count++;
}

console.log('Compound\tTempBin\tAvgStint');
const keys = Object.keys(stats).sort();
for (const k of keys) {
    const [bin, compound] = k.split('_');
    const s = stats[k];
    console.log(`${compound}\t${bin}\t${(s.sum/s.count).toFixed(1)}`);
}
