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
                const s1 = strats[pos1], s2 = strats[pos2];
                if (!s1.pit_stops || !s2.pit_stops || s1.pit_stops.length!==1 || s2.pit_stops.length!==1) continue;
                if (s1.starting_tire !== s2.starting_tire) continue;
                if (s1.pit_stops[0].lap === s2.pit_stops[0].lap) {
                    const t1 = s1.pit_stops[0].to_tire, t2 = s2.pit_stops[0].to_tire;
                    if ((t1==='SOFT'&&t2==='MEDIUM') || (t1==='MEDIUM'&&t2==='SOFT')) {
                        const win = (t1==='SOFT') ? (r.finishing_positions.indexOf(s1.driver_id) < r.finishing_positions.indexOf(s2.driver_id)) : (r.finishing_positions.indexOf(s2.driver_id) < r.finishing_positions.indexOf(s1.driver_id));
                        results.push({ temp, lapsLeft: r.race_config.total_laps - s1.pit_stops[0].lap, win });
                    }
                }
            }
        }
    }
}

const temps = [...new Set(results.map(x=>x.temp))].sort((a,b)=>a-b);
temps.forEach(t => {
    const tr = results.filter(x => x.temp === t);
    const laps = [...new Set(tr.map(x=>x.lapsLeft))].sort((a,b)=>a-b);
    let crossover = -1;
    for (const L of laps) {
        const lr = tr.filter(x => x.lapsLeft === L);
        if (lr.length > 20) {
            const rate = lr.filter(x => x.win).length / lr.length;
            if (rate < 0.5) { crossover = L-1; break; }
        }
    }
    if (crossover > 0) console.log(`Temp ${t}: SOFT better than MEDIUM for ${crossover} Laps`);
});
