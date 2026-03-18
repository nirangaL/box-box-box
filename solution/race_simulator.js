const fs = require('fs');
const path = require('path');

function getP(p, group, tire, fallback) {
    if (!p) return fallback;
    if (p[group] && p[group][tire] !== undefined) return p[group][tire];
    if (p[group] !== undefined && typeof p[group] !== 'object') return p[group];
    return fallback;
}

function simulate(race) {
    const rc = race.race_config, base = rc.base_lap_time, temp = rc.track_temp, pit = rc.pit_lane_time, total = rc.total_laps;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;

    // Load parameters here, assume they are passed as process env or fetched if undefined
    // For now we load the DE ones directly inside
    let pObj = null;
    try {
        pObj = JSON.parse(fs.readFileSync(path.join(__dirname, 'learned_params.json'), 'utf8')).params;
    } catch(e) {}
    
    // Explicit array extraction to perfectly match track_stats
    const p = [
        getP(pObj, 'offset', 'SOFT', -0.05), getP(pObj, 'offset', 'MEDIUM', -0.03), getP(pObj, 'offset', 'HARD', -0.01),
        getP(pObj, 'tempCoeff', 'SOFT', 0.02), getP(pObj, 'tempCoeff', 'MEDIUM', 0.02), getP(pObj, 'tempCoeff', 'HARD', 0.02),
        getP(pObj, 'degr1', 'SOFT', 0.01), getP(pObj, 'degr1', 'MEDIUM', 0.005), getP(pObj, 'degr1', 'HARD', 0.002),
        getP(pObj, 'degr2', 'SOFT', 0), getP(pObj, 'degr2', 'MEDIUM', 0), getP(pObj, 'degr2', 'HARD', 0),
        getP(pObj, 'freshBonus', 'SOFT', -0.5), getP(pObj, 'freshBonus', 'MEDIUM', -0.5), getP(pObj, 'freshBonus', 'HARD', -0.5),
        getP(pObj, 'pitExitPenalty', null, 0),
        getP(pObj, 'shelfLife', 'SOFT', 10), getP(pObj, 'shelfLife', 'MEDIUM', 20), getP(pObj, 'shelfLife', 'HARD', 30),
        getP(pObj, 'queuePenalty', null, 0)
    ];

    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            const wearAge = Math.max(0, c.age - p[16 + ti]);
            const wearEffect = (p[6 + ti] * wearAge + p[9 + ti] * wearAge * wearAge) * (1 + p[3 + ti] * tDelta);
            c.time += base * (1 + p[ti] + wearEffect) + (c.age === 1 ? p[12 + ti] : 0) + (c.si > 0 && c.age === 1 ? p[15] : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c) => {
            c.time += pit + p[19];
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x=>x.id);
}

function runFromStdin() {
  const chunks = [];
  process.stdin.on('data', chunk => chunks.push(chunk));
  process.stdin.on('end', () => {
    const input = Buffer.concat(chunks).toString().trim();
    if (!input) return;
    try {
      const race = JSON.parse(input);
      const finishing = simulate(race);
      const output = { race_id: race.race_id, finishing_positions: finishing };
      process.stdout.write(JSON.stringify(output) + '\n');
    } catch (err) {
      console.error(err.message || String(err));
      process.exit(1);
    }
  });
}

if (require.main === module) runFromStdin();
module.exports = { simulate };
