import { startHub } from "./hub";

const hub = startHub();

console.info(`M5 WebSocket hub listening on ${hub.server.url}`);
