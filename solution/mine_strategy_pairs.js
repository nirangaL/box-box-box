const fs = require('fs');
const path = require('path');

const DATA_DIR = 'data/historical_races';
const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort();

/**
 * Find races where two drivers have:
 * - Same starting tire
 * - Same pit stop tires
 * - Pit stops at laps L and L+1
 * - No other pit stops
 */
function findStrategyPair() {
    for (const f of files) {
        const races = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
        for (const r of races) {
            const strats = r.strategies;
            for (let i = 1; i <= 20; i++) {
                for (let j = i + 1; j <= 20; j++) {
                    const s1 = strats[`pos${i}`];
                    const s2 = strats[`pos${j}`];
                    if (!s1 || !s2) continue;
                    if (s1.starting_tire !== s2.starting_tire) continue;
                    if (s1.pit_stops.length !== 1 || s2.pit_stops.length !== 1) continue;
                    if (s1.pit_stops[0].to_tire !== s2.pit_stops[0].to_tire) continue;
                    
                    const lap1 = s1.pit_stops[0].lap;
                    const lap2 = s2.pit_stops[0].lap;
                    
                    if (Math.abs(lap1 - lap2) === 1) {
                        const rank1 = r.finishing_positions.indexOf(s1.driver_id);
                        const rank2 = r.finishing_positions.indexOf(s2.driver_id);
                        
                        console.log(`Match in ${r.race_id}: ${s1.starting_tire}->${s1.pit_stops[0].to_tire}. Lap ${lap1}(P${i}) vs Lap ${lap2}(P${j}). Ranks: ${rank1+1} vs ${rank2+1}`);
                        // If we find many of these, we can see if the person who pits LATER usually wins.
                    }
                }
            }
        }
    }
}

findStrategyPair();
