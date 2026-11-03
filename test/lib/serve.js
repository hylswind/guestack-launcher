// Dev-only helpers for the workerd and browser adapters (Node).
import { createServer } from "node:net";

/** Ask the OS for a free TCP port on 127.0.0.1. */
export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
