// db.js
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const config = require('./config');

const dbFile = config.sqlite_db;
const dir = path.dirname(dbFile);
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

// DB कनेक्शन
const db = new Database(dbFile);

function initDatabase() {
    console.log('Initializing database...');
    // orders: razorpay order id -> fileId, amount, createdAt
    db.exec(`CREATE TABLE IF NOT EXISTS orders (
        order_id TEXT PRIMARY KEY,
        file_id TEXT,
        amount INTEGER,
        receipt TEXT,
        created_at INTEGER
    )`);
    
    // tokens: वन-टाइम डाउनलोड टोकन
    db.exec(`CREATE TABLE IF NOT EXISTS tokens (
        token TEXT PRIMARY KEY,
        file_path TEXT,
        expires_at INTEGER
    )`);
    
    // files: fileId -> filename मैपिंग
    db.exec(`CREATE TABLE IF NOT EXISTS files (
        file_id TEXT PRIMARY KEY,
        filename TEXT
    )`);

    // पुरानी एंट्रीज को अनदेखा करने के लिए 'OR IGNORE'
    const stmt = db.prepare("INSERT OR IGNORE INTO files (file_id, filename) VALUES (?, ?)");
    stmt.run('banner1', 'banner1-clean.png');
    stmt.run('banner2', 'banner2-clean.jpg');
    console.log('Database initialized.');
}

// यदि सीधे 'node db.js --init' के रूप में चलाया जाता है
if (require.main === module && process.argv.includes('--init')) {
    initDatabase();
}

// DB कनेक्शन और इनिट फ़ंक्शन एक्सपोर्ट करें
module.exports = { db, initDatabase };
