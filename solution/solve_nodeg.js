const fs = require('fs');

const t = JSON.parse(fs.readFileSync('data/test_cases/inputs/test_001.json', 'utf8'));
const exp = JSON.parse(fs.readFileSync('data/test_cases/expected_outputs/test_001.json', 'utf8')).finishing_positions;
const strats = t.strategies;

const cars = [];
for (let i = 1; i <= 20; i++) {
    const s = strats[`pos${i}`];
    let L_s = 0, L_m = 0, L_h = 0;
    
    // Assume 1 pit stop for test 1
    const pitLap = s.pit_stops[0].lap;
    const t1 = s.starting_tire[0];
    const t2 = s.pit_stops[0].to_tire[0];
    
    if (t1 === 'S') L_s += pitLap;
    else if (t1 === 'M') L_m += pitLap;
    else L_h += pitLap;
    
    const L2 = t.race_config.total_laps - pitLap;
    if (t2 === 'S') L_s += L2;
    else if (t2 === 'M') L_m += L2;
    else L_h += L2;
    
    cars.push({ id: s.driver_id, grid: i, L_s, L_m, L_h });
}

function tryPaces(pS, pM, pH, gap) {
    const c = cars.map(x => ({
        id: x.id,
        grid: x.grid,
        time: x.L_s * pS + x.L_m * pM + x.L_h * pH + x.grid * gap
    }));
    c.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
    const ids = c.map(x => x.id);
    let ok = 0;
    for(let i=0; i<20; i++) if (ids[i] === exp[i]) ok++;
    return ok;
}

console.log("Searching No-Degradation Perfect Model...");
let best = 0;
for (let ns = -3.0; ns <= 0; ns += 0.1) {
    for (let nm = -2.0; nm <= 1.0; nm += 0.1) {
        for (let nh = -1.0; nh <= 2.0; nh += 0.1) {
            for (let g = 0; g <= 0.2; g += 0.05) {
                const s = tryPaces(ns, nm, nh, g);
                if (s > best) {
                    best = s;
                    if (s >= 18) {
                        console.log(`Found ${s}: S=${ns.toFixed(1)}, M=${nm.toFixed(1)}, H=${nh.toFixed(1)}, gap=${g}`);
                        if (s === 20) process.exit(0);
                    }
                }
            }
        }
    }
}
