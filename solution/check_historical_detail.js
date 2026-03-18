const fs = require('fs');
const path = require('path');

const DATA_DIR = 'data/historical_races';
const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort();

// We want to find a race with a LONG stint on one tire type
function analyzeStint(tireType) {
    for (const f of files) {
        const races = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
        for (const r of races) {
            const rc = r.race_config;
            // Find a driver who didn't pit for a long time
            for (const pos in r.strategies) {
                const s = r.strategies[pos];
                // Check starting tire
                if (s.starting_tire === tireType) {
                    const firstStop = s.pit_stops && s.pit_stops.length > 0 ? s.pit_stops[0].lap : rc.total_laps;
                    if (firstStop > 25) {
                        console.log(`Analyzing ${tireType} stint in ${r.race_id} (Temp: ${rc.track_temp}, Laps: ${firstStop})`);
                        // Unfortunately we don't have per-lap times in the historical data JSON!
                        // Wait... the historical data ONLY HAS finishing_positions.
                        // How can anyone "visualize the data" to find the pattern if there are no lap times?
                        // Ah! Maybe they visualized the FINISHING POSITIONS vs CONFIG variables?
                        return;
                    }
                }
            }
        }
    }
}

analyzeStint('HARD');
analyzeStint('MEDIUM');
analyzeStint('SOFT');
