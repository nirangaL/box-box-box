const fs = require('fs');
const path = require('path');

const DATA_DIR = 'data/historical_races';
const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));

const deltas = { SOFT: [], MEDIUM: [], HARD: [] };

for (const f of files) {
    const races = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    for (const r of races) {
        const strats = r.strategies;
        const posKeys = Object.keys(strats);
        for (let i = 0; i < posKeys.length; i++) {
            for (let j = i + 1; j < posKeys.length; j++) {
                const s1 = strats[posKeys[i]];
                const s2 = strats[posKeys[j]];
                if (!s1 || !s2) continue;
                if (s1.starting_tire !== s2.starting_tire) continue;
                if (!s1.pit_stops || !s2.pit_stops || s1.pit_stops.length !== 1 || s2.pit_stops.length !== 1) continue;
                if (s1.pit_stops[0].to_tire !== s2.pit_stops[0].to_tire) continue;
                
                const L1 = s1.pit_stops[0].lap;
                const L2 = s2.pit_stops[0].lap;
                
                if (Math.abs(L1 - L2) === 1) {
                    const earlyLap = Math.min(L1, L2);
                    const lateLap = Math.max(L1, L2);
                    // This is a direct measure of (1 lap of Age EarlyLap vs 1 lap of Freshness)
                    // Unfortunately, we only have finishing POSITIONS, not TIMES.
                    // But we can check the WIN RATE of the earlier pitter vs later pitter.
                    const d1_win = r.finishing_positions.indexOf(s1.driver_id) < r.finishing_positions.indexOf(s2.driver_id);
                    const early_won = (L1 < L2) ? d1_win : !d1_win;
                    
                    const tire = s1.starting_tire;
                    deltas[tire].push({ lap: earlyLap, early_won });
                }
            }
        }
    }
}

for (const tire in deltas) {
    const d = deltas[tire];
    const buckets = {};
    d.forEach(x => {
        if (!buckets[x.lap]) buckets[x.lap] = { early: 0, late: 0 };
        if (x.early_won) buckets[x.lap].early++; else buckets[x.lap].late++;
    });
    console.log(`\n--- ${tire} ---`);
    Object.keys(buckets).sort((a,b)=>a-b).forEach(L => {
        const b = buckets[L];
        const winRate = (b.early / (b.early + b.late) * 100).toFixed(1);
        if (b.early + b.late > 10) {
            console.log(`Lap ${L}: Early Pitter Win Rate ${winRate}% (${b.early + b.late} cases)`);
        }
    });
}
