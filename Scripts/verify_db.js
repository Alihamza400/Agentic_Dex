import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

async function verifyDB() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'AI_Autonomus_dex',
  });

  console.log('--- Verifying Database Content ---');

  const [blocks] = await connection.query('SELECT COUNT(*) as count FROM blocks');
  console.log(`Total blocks synced: ${blocks[0].count}`);

  const [events] = await connection.query('SELECT eventName, COUNT(*) as count FROM dex_events GROUP BY eventName');
  console.log('Events by type:');
  events.forEach(e => console.log(`  - ${e.eventName}: ${e.count}`));

  const [latestSnapshots] = await connection.query('SELECT * FROM pair_snapshots ORDER BY blockNumber DESC LIMIT 5');
  console.log('Latest Pair Snapshots:');
  latestSnapshots.forEach(s => {
    console.log(`  - Block ${s.blockNumber}: Pair ${s.pairAddress}, Spot Price: ${s.spotPrice}`);
  });

  await connection.end();
}

verifyDB().catch(err => {
  console.error('Error verifying database:', err);
  process.exit(1);
});
