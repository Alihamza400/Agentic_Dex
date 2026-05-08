import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

async function init() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  await conn.query(`
    CREATE TABLE IF NOT EXISTS agent_config (
      id INT PRIMARY KEY,
      strategy VARCHAR(50),
      risk_level VARCHAR(20),
      is_active BOOLEAN,
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await conn.query(`
    INSERT INTO agent_config (id, strategy, risk_level, is_active) 
    VALUES (1, 'arbitrage', 'medium', false) 
    ON DUPLICATE KEY UPDATE id=id
  `);

  console.log("Agent Config table ready.");
  await conn.end();
}

init().catch(console.error);
