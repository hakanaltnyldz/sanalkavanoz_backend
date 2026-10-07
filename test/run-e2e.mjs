// Gercek Postgres gerektirmeden uctan uca test:
// bellek ici PGlite -> prisma db push -> sunucu -> test/e2e.test.mjs
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const DB_PORT = 5433;
const API_PORT = 3100;
const env = {
  ...process.env,
  DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/postgres?sslmode=disable&connection_limit=1&pgbouncer=true`,
  PORT: String(API_PORT),
  NODE_ENV: "test",
  JWT_SECRET: "test-secret",
};

// Veritabani bu surecte calistigi icin alt surecler senkron (spawnSync) baslatilamaz.
function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env, stdio: "inherit", ...options });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

const db = await PGlite.create();
const dbServer = new PGLiteSocketServer({ db, port: DB_PORT, host: "127.0.0.1" });
await dbServer.start();

let server;
let exitCode = 1;

try {
  // Render ile ayni komut: once pre-push.sql, sonra db push.
  const pushCode = await run("npm", ["run", "prisma:push"], { shell: true });
  if (pushCode !== 0) {
    throw new Error("prisma db push basarisiz");
  }

  server = spawn(process.execPath, ["src/server.js"], { env, stdio: "inherit" });

  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${API_PORT}/api/health`);
      if (res.ok) break;
    } catch {
      // sunucu henuz ayakta degil
    }
    await sleep(200);
  }

  exitCode = await run(process.execPath, ["test/e2e.test.mjs"]);
} catch (error) {
  console.error(error);
} finally {
  server?.kill();
  await dbServer.stop();
  await db.close();
  process.exit(exitCode);
}
