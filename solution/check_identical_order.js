const fs = require('fs');
const path = require('path');

const DATA_DIR = 'data/historical_races';
const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));

let matches = 0;

for (const f of files) {
    const races = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    for (const r of races) {
        const patterns = {};
        for (const pos in r.strategies) {
            const s = r.strategies[pos];
            const key = `${s.starting_tire}-${(s.pit_stops || []).map(p => `${p.lap}:${p.to_tire}`).join(',')}`;
            if (!patterns[key]) patterns[key] = [];
            patterns[key].push({ pos, id: s.driver_id });
        }
        
        for (const key in patterns) {
            const drivers = patterns[key];
            if (drivers.length >= 4) { // Look for at least 4 drivers with SAME strategy
                matches++;
                // Sort by grid position (pos1, pos2...)
                drivers.sort((a, b) => parseInt(a.pos.replace('pos', '')) - parseInt(b.pos.replace('pos', '')));
                const ranks = drivers.map(d => r.finishing_positions.indexOf(d.id) + 1);
                
                console.log(`Race ${r.race_id} (${r.race_config.track}, Temp ${r.race_config.track_temp}): ${drivers.length} drivers with ${key}`);
                console.log(`Grid: ${drivers.map(d => d.pos.replace('pos', '')).join(', ')}`);
                console.log(`Rank: ${ranks.join(', ')}`);
                
                if (matches >= 10) return;
            }
        }
    }
}
