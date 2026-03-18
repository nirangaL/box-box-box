const fs = require('fs');
const path = require('path');
const { simulate: simRace } = require('./race_simulator.js');

const globalBest = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;
const TEST_DIR = path.join(__dirname, '..', 'data', 'test_cases');

function simTrackStats(race) {
    const p = [
        globalBest.offset.SOFT, globalBest.offset.MEDIUM, globalBest.offset.HARD,
        globalBest.tempCoeff.SOFT, globalBest.tempCoeff.MEDIUM, globalBest.tempCoeff.HARD,
        globalBest.degr1.SOFT, globalBest.degr1.MEDIUM, globalBest.degr1.HARD,
        globalBest.degr2.SOFT, globalBest.degr2.MEDIUM, globalBest.degr2.HARD,
        globalBest.freshBonus.SOFT, globalBest.freshBonus.MEDIUM, globalBest.freshBonus.HARD,
        globalBest.pitExitPenalty,
        globalBest.shelfLife.SOFT, globalBest.shelfLife.MEDIUM, globalBest.shelfLife.HARD,
        globalBest.queuePenalty || 0
    ];
    
    // EXPOSE TIMES FOR DIFF
    const rc = race.race_config, base = rc.base_lap_time, temp = rc.track_temp, pit = rc.pit_lane_time, total = rc.total_laps;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            const wearAge = Math.max(0, c.age - p[16 + ti]);
            const wearEffect = (p[6 + ti] * wearAge + p[9 + ti] * wearAge * wearAge) * (1 + p[3 + ti] * tDelta);
            c.time += base * (1 + p[ti] + wearEffect) + (c.age === 1 ? p[12 + ti] : 0) + (c.si > 0 && c.age === 1 ? p[15] : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a, b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c) => {
            c.time += pit + (p[19] || 0); // Single qPen for simplicity here
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
}

function simRaceWithTimes(race) {
    // Modify race_simulator temporarily ... wait we can't do that easily as it returns strings.
    // Let's copy race_simulator logic identically to see where time differ:
    
    const rc = race.race_config, base = rc.base_lap_time, temp = rc.track_temp, pit = rc.pit_lane_time, total = rc.total_laps;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
    }
    const get = (g, t, f) => {
        if(globalBest[g] && globalBest[g][t] !== undefined) return globalBest[g][t];
        if(globalBest[g] !== undefined && typeof globalBest[g] !== 'object') return globalBest[g];
        return f;
    };
    for(let lap=1; lap<=total; lap++) {
        for(const c of cars) {
            c.age++;
            const tire = c.tire;
            const wearAge = Math.max(0, c.age - get('shelfLife', tire, 0));
            const wearEffect = (get('degr1', tire, 0)*wearAge + get('degr2', tire, 0)*wearAge*wearAge) * (1 + get('tempCoeff', tire, 0)*(temp-30));
            const lapTime = base * (1 + get('offset', tire, 0) + wearEffect) + (c.age===1?get('freshBonus', tire, 0):0) + (c.si>0&&c.age===1?get('pitExitPenalty', tire, 0):0);
            c.time += lapTime;
        }
        
        const pittingIndices = [];
        for (let i = 0; i < 20; i++) {
          if (cars[i].si < cars[i].stops.length && cars[i].stops[cars[i].si].lap === lap) pittingIndices.push(i);
        }

        if (pittingIndices.length > 0) {
          pittingIndices.sort((a, b) => {
            const ca = cars[a], cb = cars[b];
            if (Math.abs(ca.time - cb.time) < 1e-9) return ca.grid - cb.grid;
            return ca.time - cb.time;
          });

          for (let q = 0; q < pittingIndices.length; q++) {
            const car = cars[pittingIndices[q]];
            car.time += pit + q * get('queuePenalty', null, 0);
            car.tire = car.stops[car.si].to_tire; car.age = 0; car.si++;
          }
        }
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
}

for (let i = 1; i <= 100; i++) {
    const id = String(i).padStart(3, '0');
    const input = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'inputs', `test_${id}.json`), 'utf8'));
    const tOut = simTrackStats(input);
    const rOut = simRaceWithTimes(input);
    
    let mismatch = false;
    for(let j=0; j<20; j++) {
        if(tOut[j].id !== rOut[j].id) { mismatch = true; break; }
    }
    
    if (mismatch) {
        console.log(`Mismatch at TEST_${id}!`);
        for(let j=0; j<20; j++) {
            const tCar = tOut.find(c => c.id === 'D001');
            const rCar = rOut.find(c => c.id === 'D001');
            console.log(`D001 Time -> TrackStats: ${tCar.time.toFixed(6)}, RaceSim: ${rCar.time.toFixed(6)}`);
            break;
        }
        
        let diffStr = '';
        for(let j=0; j<20; j++) {
            const t = tOut[j]; const r = rOut[j];
            diffStr += `${j+1}: ${t.id} vs ${r.id} | `;
        }
        console.log(diffStr.substring(0, 100) + '...');
        break;
    }
}
