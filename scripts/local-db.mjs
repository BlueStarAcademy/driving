import EmbeddedPostgres from "embedded-postgres";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseDir = path.join(root, ".pg-data");

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "postgres",
  password: "postgres",
  port: 5432,
  persistent: true,
});

await pg.initialise();
await pg.start();

try {
  await pg.createDatabase("driving");
  console.log('Created database "driving"');
} catch {
  console.log('Database "driving" already exists');
}

console.log("Postgres ready: postgresql://postgres:postgres@localhost:5432/driving");
console.log("Keep this terminal open. Ctrl+C to stop.");

const stop = async () => {
  try {
    await pg.stop();
  } finally {
    process.exit(0);
  }
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

await new Promise(() => {});
