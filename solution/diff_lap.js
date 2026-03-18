const fs = require('fs');
const path = require('path');

const globalBest = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;
const TEST_DIR = path.join(__dirname, '..', 'data', 'test_cases');

function diffLap(race) {
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
    
    const get = (g, t, f) => {
        if(globalBest[g] && globalBest[g][t] !== undefined) return globalBest[g][t];
        if(globalBest[g] !== undefined && typeof globalBest[g] !== 'object') return globalBest[g];
        return f;
    };
    
    const base = race.race_config.base_lap_time, temp = race.race_config.track_temp, pit = race.race_config.pit_lane_time, total = race.race_config.total_laps;
    const carsR = [], carsT = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        carsR.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
        carsT.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;
    
    for (let lap = 1; lap <= total; lap++) {
        for(let i=0; i<20; i++) {
            const cT = carsT[i], cR = carsR[i];
            
            cT.age++;
            const ti = cT.tire[0] === 'S' ? 0 : cT.tire[0] === 'M' ? 1 : 2;
            const wearAge = Math.max(0, cT.age - p[16 + ti]);
            const wearEffect = (p[6 + ti] * wearAge + p[9 + ti] * wearAge * wearAge) * (1 + p[3 + ti] * tDelta);
            const lapTimeT = base * (1 + p[ti] + wearEffect) + (cT.age === 1 ? p[12 + ti] : 0) + (cT.si > 0 && cT.age === 1 ? p[15] : 0);
            cT.time += lapTimeT;

            cR.age++;
            const tire = cR.tire;
            const wearAgeR = Math.max(0, cR.age - get('shelfLife', tire, 0));
            const wearEffectR = (get('degr1', tire, 0)*wearAgeR + get('degr2', tire, 0)*wearAgeR*wearAgeR) * (1 + get('tempCoeff', tire, 0)*tDelta);
            const lapTimeR = base * (1 + get('offset', tire, 0) + wearEffectR) + (cR.age===1?get('freshBonus', tire, 0):0) + (cR.si>0&&cR.age===1?get('pitExitPenalty', tire, 0):0);
            cR.time += lapTimeR;
            
            if (cT.id === 'D006' && lap === 7) {
                console.log(`[Lap 7 PRE-PIT] D006: TrackStats time=${cT.time}, RaceSim time=${cR.time}`);
            }
        }
        
        let pittingT = carsT.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pittingT.sort((a, b) => (a.time - b.time) || (a.grid - b.grid));
        pittingT.forEach((c) => {
            c.time += pit + (p[19] || 0); 
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
            if (c.id === 'D006' && lap === 7) {
                console.log(`[Lap 7 POST-PIT TrackStats] D006: time=${c.time}, pit_lane_time=${pit}`);
            }
        });
        
        const pittingIndices = [];
        for (let i = 0; i < 20; i++) {
          if (carsR[i].si < carsR[i].stops.length && carsR[i].stops[carsR[i].si].lap === lap) pittingIndices.push(i);
        }

        if (pittingIndices.length > 0) {
          pittingIndices.sort((a, b) => {
            const ca = carsR[a], cb = carsR[b];
            if (Math.abs(ca.time - cb.time) < 1e-9) return ca.grid - cb.grid;
            return ca.time - cb.time;
          });

          for (let q = 0; q < pittingIndices.length; q++) {
            const car = carsR[pittingIndices[q]];
            const pen = get('queuePenalty', null, 0);
            car.time += pit + q * pen;
            car.tire = car.stops[car.si].to_tire; car.age = 0; car.si++;
            if (car.id === 'D006' && lap === 7) {
                console.log(`[Lap 7 POST-PIT RaceSim] D006: time=${car.time}, pit_lane_time=${pit}, q=${q}, pen=${pen}`);
            }
          }
        }
    }
}

const input = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'inputs', `test_004.json`), 'utf8'));
diffLap(input);
