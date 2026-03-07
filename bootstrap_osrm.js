const OsrmService = require('./server/dist/services/OsrmService.js').default;

async function bootstrap() {
    console.log("Starting manual background map setup for Madrid...");
    try {
        await OsrmService.downloadMap("madrid", "https://download.geofabrik.de/europe/spain/madrid-latest.osm.pbf", "madrid-latest.osm.pbf", true);
        console.log("Download finished. Activating...");
        await OsrmService.activateMap("madrid", "madrid-latest.osm.pbf");
        console.log("Activation finished.");
    } catch (e) {
        console.error("Error setting up OSRM:", e);
    }
}
bootstrap();
