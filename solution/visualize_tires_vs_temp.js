const fs = require('fs');
const path = require('path');

const DATA_DIR = 'data/historical_races';
const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));

const data = [];

for (const f of files) {
    const races = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    for (const r of races) {
        const temp = r.race_config.track_temp;
        for (const pos in r.strategies) {
            const s = r.strategies[pos];
            if (s.starting_tire === 'SOFT' && s.pit_stops.length > 0) {
                const age = s.pit_stops[0].lap;
                const win = r.finishing_positions.indexOf(s.driver_id) < 5; // Top 5 finish as a proxy for success
                data.push({ temp, age, win });
            }
        }
    }
}

const temps = [...new Set(data.map(x=>x.temp))].sort((a,b)=>a-b);
temps.forEach(t => {
    const d = data.filter(x => x.temp === t && x.win);
    if (d.length > 50) {
        // Average age of SOFT tires in winning strategies
        const avgAge = d.reduce((a,b)=>a+b.age, 0) / d.length;
        console.log(`Temp ${t}: Winners pit SOFT at average lap ${avgAge.toFixed(1)}`);
    }
});
