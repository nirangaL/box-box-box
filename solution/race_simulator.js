const fs = require('fs');
const path = require('path');

/**
 * Standard F1 Race Simulator with Advanced Physics
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

    // Load parameters
    let p = p_override;
    if (!p) {
        try {
            const pFile = path.join(__dirname, 'learned_params.json');
            const pData = JSON.parse(fs.readFileSync(pFile, 'utf8'));
            p = pData.params;
        } catch (e) {
            p = {
                offset: { SOFT: -0.05, MEDIUM: -0.03, HARD: -0.01 },
                tempCoeff: { SOFT: 0.02, MEDIUM: 0.02, HARD: 0.02 },
                degr1: { SOFT: 0.015, MEDIUM: 0.008, HARD: 0.004 },
                degr2: { SOFT: 0.0001, MEDIUM: 0.00005, HARD: 0.00002 },
                degrExp: { SOFT: 2.0, MEDIUM: 2.0, HARD: 2.0 },
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
    const tempRef = p.tempRef || 30;
    const tDelta = temp - tempRef;

    ['SOFT', 'MEDIUM', 'HARD'].forEach(t => {
        ensure(p.offset, t, 0);
        ensure(p.tempCoeff, t, 0);
        ensure(p.degr1, t, 0);
        ensure(p.degr2, t, 0);
        ensure(p.degrExp || (p.degrExp = {}), t, 2);
        ensure(p.freshBonus, t, 0);
        ensure(p.shelfLife, t, 0);
        ensure(p.fuelPace || (p.fuelPace = {}), t, 0);
        ensure(p.fuelWear || (p.fuelWear = {}), t, 0);
    });
    ensure(p, 'pitExitPenalty', 0);
    ensure(p, 'queuePenalty', 0);

    // Simulation Loop
    for (let lap = 1; lap <= total; lap++) {
        const fuelBonus = (lap - 1) / total;

        for (const c of cars) {
            c.age++;
            const ti = c.tire;
            const wearAge = Math.max(0, c.age - p.shelfLife[ti]);
            const wearScale = (1 + p.tempCoeff[ti] * tDelta) * (1 - p.fuelWear[ti] * fuelBonus);
            // 3. Power Law Degradation: age + age ^ exponent
            const wearEffect = (p.degr1[ti] * wearAge + p.degr2[ti] * Math.pow(wearAge, p.degrExp[ti] || 2)) * wearScale;
            
            // 4. Lap Time Calculation: Base * (1 + Compound + Wear - Fuel Advantage) + Fresh Bonus + Pit Exit
            const lapTime = base * (1 + p.offset[ti] + wearEffect - p.fuelPace[ti] * fuelBonus)
                          + (c.age === 1 ? p.freshBonus[ti] : 0)
                          + (c.si > 0 && c.age === 1 ? p.pitExitPenalty : 0);
            
            c.time += lapTime;
        }

        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        if (pitting.length > 0) {
            pitting.sort((a, b) => (a.time - b.time) || (a.grid - b.grid));
            pitting.forEach((c, q) => {
                c.time += pit + q * p.queuePenalty;
                c.tire = c.stops[c.si].to_tire.toUpperCase();
                c.age = 0;
                c.si++;
            });
        }
    }

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
            process.exit(1);
        }
    });
}

if (require.main === module) runFromStdin();
module.exports = { simulate };
