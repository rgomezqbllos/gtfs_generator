
// Simulation of the analyzeTimeSlots logic for testing

interface Event {
    time: number;
    duration: number;
}

function timeToSeconds(timeStr: string): number {
    const [h, m, s] = timeStr.split(':').map(Number);
    return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}

function secondsToTime(totalSeconds: number): string {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// Mock data: 3 trips, 2 of them start at the same time but have different durations
const mockEvents: Event[] = [
    { time: 3600, duration: 600 },  // 01:00:00, 10 min
    { time: 3600, duration: 1200 }, // 01:00:00, 20 min (Duplicate time, longer duration)
    { time: 7200, duration: 600 }   // 02:00:00, 10 min
];

function generateSlots(events: Event[]) {
    console.log('--- Input Events ---');
    console.log(events);

    // Sort by time
    events.sort((a, b) => a.time - b.time);

    // Current Broken Logic (Simulated)
    console.log('\n--- Current Logic Output ---');
    let currentStart = events[0].time;
    let currentDuration = events[0].duration;

    const slots = [];

    for (let k = 1; k < events.length; k++) {
        const e = events[k];
        // The issue: if next event has same time but different duration, 
        // e.time (3600) - currentStart (3600) = 0 length slot?
        // OR it creates a slot from 3600 to 3600 with duration 600.

        if (e.duration !== currentDuration) {
            slots.push({
                start: secondsToTime(currentStart),
                end: secondsToTime(e.time),
                duration: currentDuration
            });
            currentStart = e.time;
            currentDuration = e.duration;
        }
    }
    // Last slot
    slots.push({
        start: secondsToTime(currentStart),
        end: "30:00:00",
        duration: currentDuration
    });

    console.table(slots);
    return slots;
}

function generateSlotsFixed(events: Event[]) {
    console.log('\n--- Fixed Logic Output ---');

    // 1. Group by time and pick max duration
    const eventMap = new Map<number, number>();
    for (const e of events) {
        const existing = eventMap.get(e.time);
        if (!existing || e.duration > existing) {
            eventMap.set(e.time, e.duration);
        }
    }

    // 2. Convert back to array and sort
    const uniqueEvents = Array.from(eventMap.entries())
        .map(([time, duration]) => ({ time, duration }))
        .sort((a, b) => a.time - b.time);

    console.log('Unique Events:', uniqueEvents);

    // 3. RLE
    if (uniqueEvents.length === 0) return [];

    let currentStart = uniqueEvents[0].time;
    let currentDuration = uniqueEvents[0].duration;

    const slots = [];

    for (let k = 1; k < uniqueEvents.length; k++) {
        const e = uniqueEvents[k];
        if (e.duration !== currentDuration) {
            slots.push({
                start: secondsToTime(currentStart),
                end: secondsToTime(e.time),
                duration: currentDuration
            });
            currentStart = e.time;
            currentDuration = e.duration;
        }
    }
    // Last slot
    slots.push({
        start: secondsToTime(currentStart),
        end: "30:00:00",
        duration: currentDuration
    });

    console.table(slots);
    return slots;
}

generateSlots([...mockEvents]);
generateSlotsFixed([...mockEvents]);
