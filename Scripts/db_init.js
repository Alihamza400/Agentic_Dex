/**
 * Creates the MySQL database (if missing) plus every table used by the indexer,
 * the PHP API and the Python agents. Safe to run repeatedly.
 *
 * Usage: node Scripts/db_init.js
 */
import mysql from "mysql2/promise";

import { readEnv } from "./env.js";
import { ensureSchema } from "./sync.js";

async function initDB() {
  const env = readEnv();
  const host = env.DB_HOST || "127.0.0.1";
  const user = env.DB_USER || "root";
  const password = env.DB_PASSWORD || "";
  const database = env.DB_NAME || "AI_Autonomus_dex";

  console.log(`Connecting to MySQL at ${host} as ${user}...`);

  const root = await mysql.createConnection({ host, user, password, multipleStatements: false });
  await root.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
  console.log(`Database "${database}" is ready.`);
  await root.end();

  const conn = await mysql.createConnection({ host, user, password, database });
  await ensureSchema(conn);
  const [tables] = await conn.query("SHOW TABLES");
  await conn.end();

  console.log("Tables ready:");
  for (const row of tables) console.log(`  - ${Object.values(row)[0]}`);
  console.log('\nNext: npm run index  (then "npm run api" and "npm run agent")');
}

initDB().catch((err) => {
  console.error(`Error initializing database: ${err.message}`);
  console.error("Check DB_HOST / DB_USER / DB_PASSWORD / DB_NAME in .env");
  process.exit(1);
});
