const fs = require('fs');
const path = require('path');

const DATA_DIR = 'data/historical_races';
const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));

const paceDeltas = { SM: [], MH: [] };

for (const f of files) {
    const races = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    for (const r of races) {
        const strats = r.strategies;
        const posKeys = Object.keys(strats);
        for (let i = 0; i < posKeys.length; i++) {
            for (let j = i + 1; j < posKeys.length; j++) {
                const s1 = strats[posKeys[i]];
                const s2 = strats[posKeys[j]];
                if (!s1 || !s2 || !s1.pit_stops || !s2.pit_stops) continue;
                if (s1.pit_stops.length !== 1 || s2.pit_stops.length !== 1) continue;
                if (s1.starting_tire !== s2.starting_tire) continue;
                if (s1.pit_stops[0].lap !== s2.pit_stops[0].lap) continue;
                
                // Same history, different final tire
                const t1 = s1.pit_stops[0].to_tire;
                const t2 = s2.pit_stops[0].to_tire;
                
                if ((t1==='SOFT'&&t2==='MEDIUM') || (t1==='MEDIUM'&&t2==='SOFT')) {
                    const soft_won = (t1 === 'SOFT') ? (r.finishing_positions.indexOf(s1.driver_id) < r.finishing_positions.indexOf(s2.driver_id)) : (r.finishing_positions.indexOf(s2.driver_id) < r.finishing_positions.indexOf(s1.driver_id));
                    paceDeltas.SM.push({ lapsLeft: r.race_config.total_laps - s1.pit_stops[0].lap, soft_won });
                }
            }
        }
    }
}

for (const key in paceDeltas) {
    const buckets = {};
    paceDeltas[key].forEach(x => {
        if (!buckets[x.lapsLeft]) buckets[x.lapsLeft] = { soft_won: 0, total: 0 };
        if (x.soft_won) buckets[x.lapsLeft].soft_won++;
        buckets[x.lapsLeft].total++;
    });
    console.log(`\n--- ${key} Fresh Crossover ---`);
    Object.keys(buckets).sort((a,b)=>a-b).forEach(L => {
        const b = buckets[L];
        if (b.total > 50) {
            console.log(`Laps Left ${L}: Soft/Better Tire Win Rate ${(b.soft_won/b.total*100).toFixed(1)}% (${b.total} cases)`);
        }
    });
}
