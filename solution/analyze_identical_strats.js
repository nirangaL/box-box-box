const fs = require('fs');
const path = require('path');

const DATA_DIR = 'data/historical_races';
const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));

let matches = 0;

for (const f of files) {
    const races = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    for (const r of races) {
        // Find a race where at least 15 drivers have the SAME pit stop lap and SAME tire compounds
        const strategies = Object.values(r.strategies);
        const patterns = {};
        
        for (const s of strategies) {
            const key = `${s.starting_tire}-${s.pit_stops.map(p => `${p.lap}:${p.to_tire}`).join(',')}`;
            patterns[key] = (patterns[key] || 0) + 1;
        }
        
        const commonPattern = Object.entries(patterns).find(([k, v]) => v >= 15);
        if (commonPattern) {
            matches++;
            console.log(`Race ${r.race_id} (${r.race_config.track}): ${commonPattern[1]} drivers with ${commonPattern[0]}`);
            
            // Analyze the order of these 15 drivers
            const patternKey = commonPattern[0];
            const matchingDrivers = Object.keys(r.strategies).filter(pos => {
                const s = r.strategies[pos];
                const key = `${s.starting_tire}-${s.pit_stops.map(p => `${p.lap}:${p.to_tire}`).join(',')}`;
                return key === patternKey;
            });
            
            // Sort matchingDrivers by grid (pos1, pos2...)
            matchingDrivers.sort((a, b) => parseInt(a.replace('pos', '')) - parseInt(b.replace('pos', '')));
            
            // Get their finishing rank
            const ranks = matchingDrivers.map(pos => {
                const id = r.strategies[pos].driver_id;
                return r.finishing_positions.indexOf(id) + 1;
            });
            
            console.log(`Grid Positions: ${matchingDrivers.map(p => p.replace('pos', '')).join(', ')}`);
            console.log(`Final Ranks:    ${ranks.join(', ')}`);
            
            if (matches >= 3) return;
        }
    }
}
