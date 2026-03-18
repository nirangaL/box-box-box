const fs = require('fs');
const path = require('path');

/**
 * Standard F1 Race Simulator with Advanced Physics
 * Factors: Base Lap, Tire Compound, Quadratic Degradation, Temperature Scaling, 
 * Fuel Load (Pace & Wear), Shelf Life, Pit Exit Penalty, Pit Lane Queue Penalty.
 */
function simulate(race, p_override = null) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    
    // Initialize cars
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        cars.push({ 
            id: s.driver_id, 
            grid: i, 
            tire: s.starting_tire.toUpperCase(), 
            age: 0, 
            time: 0, 
            stops: s.pit_stops || [], 
            si: 0 
        });
    }

    const tDelta = temp - 30;

    // Load parameters
    let p = p_override;
    if (!p) {
        try {
            const pFile = path.join(__dirname, 'learned_params.json');
            const pData = JSON.parse(fs.readFileSync(pFile, 'utf8'));
            p = pData.params;
        } catch (e) {
            // Fallback to sensible defaults
            p = {
                offset: { SOFT: -0.05, MEDIUM: -0.03, HARD: -0.01 },
                tempCoeff: { SOFT: 0.02, MEDIUM: 0.02, HARD: 0.02 },
                degr1: { SOFT: 0.015, MEDIUM: 0.008, HARD: 0.004 },
                degr2: { SOFT: 0.0001, MEDIUM: 0.00005, HARD: 0.00002 },
                freshBonus: { SOFT: -0.5, MEDIUM: -0.5, HARD: -0.5 },
                pitExitPenalty: 0,
                shelfLife: { SOFT: 10, MEDIUM: 20, HARD: 30 },
                queuePenalty: 0.5,
                fuelPace: { SOFT: 0.1, MEDIUM: 0.1, HARD: 0.1 },
                fuelWear: { SOFT: 0.1, MEDIUM: 0.1, HARD: 0.1 }
            };
        }
    }

    // Ensure all required fields exist in p
    const ensure = (obj, field, def) => { if (obj[field] === undefined) obj[field] = def; };
    ['SOFT', 'MEDIUM', 'HARD'].forEach(t => {
        ensure(p.offset, t, 0);
        ensure(p.tempCoeff, t, 0);
        ensure(p.degr1, t, 0);
        ensure(p.degr2, t, 0);
        ensure(p.freshBonus, t, 0);
        ensure(p.shelfLife, t, 0);
        ensure(p.fuelPace || (p.fuelPace = {}), t, 0);
        ensure(p.fuelWear || (p.fuelWear = {}), t, 0);
    });
    ensure(p, 'pitExitPenalty', 0);
    ensure(p, 'queuePenalty', 0);

    // Simulation Loop
    for (let lap = 1; lap <= total; lap++) {
        // Fuel load: 1.0 at start (lap 1), approaching 0.0 at the end
        const fuel = (total - lap) / total;

        for (const c of cars) {
            c.age++;
            const ti = c.tire;
            
            // 1. Shelf Life: tires don't wear much initially
            const wearAge = Math.max(0, c.age - p.shelfLife[ti]);
            
            // 2. Wear Scaling: temp and fuel-wear interaction
            const wearScale = (1 + p.tempCoeff[ti] * tDelta) * (1 + p.fuelWear[ti] * fuel);
            
            // 3. Quadratic Degradation
            const wearEffect = (p.degr1[ti] * wearAge + p.degr2[ti] * wearAge * wearAge) * wearScale;
            
            // 4. Lap Time Calculation
            // Base + Compound Offset + Wear + Fuel Pace + Fresh Bonus + Pit Exit
            const lapTime = base * (1 + p.offset[ti] + wearEffect + p.fuelPace[ti] * fuel)
                          + (c.age === 1 ? p.freshBonus[ti] : 0)
                          + (c.si > 0 && c.age === 1 ? p.pitExitPenalty : 0);
            
            c.time += lapTime;
        }

        // Handle Pit Stops at end of lap
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        if (pitting.length > 0) {
            // Sort by arrival time at pit entry (current race time)
            pitting.sort((a, b) => (a.time - b.time) || (a.grid - b.grid));
            pitting.forEach((c, q) => {
                // Apply pit penalty + queue delay
                c.time += pit + q * p.queuePenalty;
                // Change tires
                c.tire = c.stops[c.si].to_tire.toUpperCase();
                c.age = 0;
                c.si++;
            });
        }
    }

    // Final Sort: total race time, then starting grid as tie-breaker
    return cars.sort((a, b) => (a.time - b.time) || (a.grid - b.grid)).map(x => x.id);
}

function runFromStdin() {
    let input = '';
    process.stdin.on('data', chunk => { input += chunk; });
    process.stdin.on('end', () => {
        if (!input.trim()) return;
        try {
            const race = JSON.parse(input);
            const finishing = simulate(race);
            process.stdout.write(JSON.stringify({
                race_id: race.race_id,
                finishing_positions: finishing
            }) + '\n');
        } catch (err) {
            console.error(err.message);
            process.exit(1);
        }
    });
}

if (require.main === module) runFromStdin();
module.exports = { simulate };
