const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10kb' }));

// Konfigurasi DB fleksibel: jalan di Docker Compose lokal, K3s, maupun AWS RDS
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'portal_user',
  password: process.env.DB_PASSWORD || 'localdevpassword',
  database: process.env.DB_NAME || 'portal_db',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS assets (
        id SERIAL PRIMARY KEY,
        asset_tag VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        category VARCHAR(50) NOT NULL,
        classification VARCHAR(30) DEFAULT 'Internal',
        status VARCHAR(30) DEFAULT 'Available'
      );
    `);

    const { rows } = await client.query('SELECT COUNT(*) FROM assets');
    if (parseInt(rows[0].count, 10) === 0) {
      await client.query(`
        INSERT INTO assets (asset_tag, name, category, classification, status) VALUES
        ('AST-001', 'MacBook Pro 16 M3 Max', 'Laptop', 'Confidential', 'Available'),
        ('AST-002', 'YubiKey 5C NFC Hardware Token', 'Security Key', 'Restricted', 'Assigned'),
        ('AST-003', 'ThinkPad X1 Carbon Gen 12', 'Laptop', 'Internal', 'Available'),
        ('AST-004', 'AWS Production Root Hardware MFA', 'Hardware Vault', 'Top Secret', 'Locked');
      `);
    }
    console.log('[DB] Schema & seed data verified.');
  } finally {
    client.release();
  }
}

app.get('/healthz', (req, res) => res.status(200).json({ status: 'alive' }));

app.get('/readyz', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ready', environment: process.env.APP_ENV || 'local' });
  } catch (err) {
    res.status(503).json({ status: 'not_ready', error: err.message });
  }
});

app.get('/api/assets', async (req, res) => {
  const user = req.headers['x-forwarded-user'] || 'local-engineer@internal.corp';
  const role = req.headers['x-forwarded-role'] || 'platform-admin';

  try {
    const result = await pool.query('SELECT * FROM assets ORDER BY id ASC');
    res.json({
      identity: { user, role },
      environment: process.env.APP_ENV || 'local',
      assets: result.rows,
    });
  } catch (err) {
    console.error('[API Error]', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/assets', async (req, res) => {
  const { asset_tag, name, category, classification } = req.body;
  if (!asset_tag || !name || !category) {
    return res.status(400).json({ error: 'asset_tag, name, and category are required' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO assets (asset_tag, name, category, classification) VALUES ($1, $2, $3, $4) RETURNING *',
      [asset_tag, name, category, classification || 'Internal']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const server = app.listen(PORT, async () => {
  console.log(`[Server] Running on port ${PORT}`);
  let retries = 5;
  while (retries) {
    try {
      await initDB();
      break;
    } catch (err) {
      console.log(`[DB] Waiting for PostgreSQL... (${retries} retries left)`);
      retries -= 1;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
});

process.on('SIGTERM', () => {
  server.close(() => pool.end(() => process.exit(0)));
});
