const fs = require('fs');
const path = require('path');

const DATA_DIR = 'data/historical_races';
const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));

const results = [];

for (const f of files) {
    const races = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    for (const r of races) {
        const strats = r.strategies;
        const temp = r.race_config.track_temp;
        for (const pos1 in strats) {
            for (const pos2 in strats) {
                if (pos1 === pos2) continue;
                const s1 = strats[pos1], s1_stop = s1.pit_stops[0];
                const s2 = strats[pos2], s2_stop = s2.pit_stops[0];
                if (s1.starting_tire === 'SOFT' && s2.starting_tire === 'SOFT' && s1_stop && s2_stop && Math.abs(s1_stop.lap - s2_stop.lap) === 1) {
                    const early_won = (s1_stop.lap < s2_stop.lap) ? (r.finishing_positions.indexOf(s1.driver_id) < r.finishing_positions.indexOf(s2.driver_id)) : (r.finishing_positions.indexOf(s2.driver_id) < r.finishing_positions.indexOf(s1.driver_id));
                    results.push({ temp, early_lap: Math.min(s1_stop.lap, s2_stop.lap), early_won });
                }
            }
        }
    }
}

const temps = [...new Set(results.map(x=>x.temp))].sort((a,b)=>a-b);
temps.forEach(t => {
    const tr = results.filter(x => x.temp === t);
    const laps = [...new Set(tr.map(x=>x.early_lap))].sort((a,b)=>a-b);
    let crossover = -1;
    for (const L of laps) {
        const lr = tr.filter(x => x.early_lap === L);
        if (lr.length > 50) {
            const winRate = lr.filter(x => x.early_won).length / lr.length;
            if (winRate > 0.5) { crossover = L; break; }
        }
    }
    console.log(`Temp ${t}: SOFT Crossover Lap ${crossover}`);
});
