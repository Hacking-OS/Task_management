import http from "http";
import { initDb } from "./db.js";
import { createApp } from "./app.js";
import { initSocket } from "./socket.js";

initDb();

const app = createApp();
const PORT = Number(process.env.PORT ?? 4000);

const server = http.createServer(app);
initSocket(server);

server.listen(PORT, () => {
  console.log(`Jellyfish backend running on http://localhost:${PORT}`);
});
