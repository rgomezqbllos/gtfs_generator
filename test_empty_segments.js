fetch('http://127.0.0.1:3001/api/routes/structure')
    .then(res => res.json())
    .then(routesStructure => {
        const newSegments = [];
        routesStructure.forEach(route => {
            const parkings = route.parkings || [];
            route.directions.forEach((dir) => {
                if (dir.stops && dir.stops.length >= 2) {
                    const firstStopId = dir.stops[0].stop_id;
                    const lastStopId = dir.stops[dir.stops.length - 1].stop_id;
                    if (firstStopId !== lastStopId) {
                        newSegments.push({ start: firstStopId, end: lastStopId });
                        newSegments.push({ start: lastStopId, end: firstStopId });
                    }
                    parkings.forEach((parkingId) => {
                        if (parkingId !== firstStopId) {
                            newSegments.push({ start: firstStopId, end: parkingId });
                            newSegments.push({ start: parkingId, end: firstStopId });
                        }
                        if (parkingId !== lastStopId && firstStopId !== lastStopId) {
                            newSegments.push({ start: lastStopId, end: parkingId });
                            newSegments.push({ start: parkingId, end: lastStopId });
                        }
                    });
                }
            });
        });
        const uniqueSegments = new Set();
        const segmentsToCreate = [];
        newSegments.forEach(pair => {
            const sig = `${pair.start}-${pair.end}`;
            if (uniqueSegments.has(sig)) return;
            uniqueSegments.add(sig);
            segmentsToCreate.push(pair);
        });
        console.log("Total unique segments to create:", segmentsToCreate.length);
    });
