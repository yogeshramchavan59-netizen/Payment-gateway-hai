// index.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const config = require('./config');
const { db, initDatabase } = require('./db');

// DB को इनिशियलाइज़ करें
initDatabase();

const app = express();
const port = process.env.PORT || 10000; // Render.com के लिए

// मिडलवेयर
app.use(cors()); // CORS सक्षम करें (Blogger से कॉल के लिए)
app.use(express.json()); // JSON बॉडी पार्स करने के लिए

// Razorpay इंस्टेंस
const rzp = new Razorpay({
    key_id: config.rzp_key_id,
    key_secret: config.rzp_key_secret,
});

// --- 1. ऑर्डर बनाएँ (POST /order) ---
app.post('/order', async (req, res) => {
    const { fileId, amount = 100 } = req.body;

    if (!fileId) {
        return res.status(400).json({ error: 'fileId required' });
    }

    // DB में फ़ाइल जाँचें
    try {
        const fileStmt = db.prepare("SELECT filename FROM files WHERE file_id = ?");
        const file = fileStmt.get(fileId);

        if (!file) {
            return res.status(404).json({ error: 'file not found' });
        }

        const receipt = `rcpt_${crypto.randomBytes(8).toString('hex')}`;
        
        // Razorpay ऑर्डर बनाएँ
        const options = {
            amount: parseInt(amount), // राशि पैसे में
            currency: 'INR',
            receipt: receipt,
            payment_capture: 1
        };
        const order = await rzp.orders.create(options);

        // DB में ऑर्डर सेव करें
        const orderStmt = db.prepare("INSERT INTO orders (order_id, file_id, amount, receipt, created_at) VALUES (?, ?, ?, ?, ?)");
        orderStmt.run(order.id, fileId, order.amount, receipt, Math.floor(Date.now() / 1000));

        // क्लाइंट को ऑर्डर डिटेल्स भेजें
        res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            rzpKeyId: config.rzp_key_id
        });

    } catch (err) {
        console.error('Order creation failed:', err);
        res.status(500).json({ error: 'razorpay-order-failed', raw: err.message });
    }
});

// --- 2. पेमेंट वेरीफाई करें (POST /verify) ---
app.post('/verify', async (req, res) => {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
        return res.status(400).json({ success: false, message: 'missing params' });
    }

    // सिग्नेचर वेरीफाई करें
    const generated_signature = crypto
        .createHmac('sha256', config.rzp_key_secret)
        .update(razorpay_order_id + '|' + razorpay_payment_id)
        .digest('hex');

    if (generated_signature !== razorpay_signature) {
        return res.status(403).json({ success: false, message: 'invalid signature' });
    }

    // (वैकल्पिक, लेकिन अनुशंसित) API से पेमेंट स्थिति वेरीफाई करें
    try {
        const paymentInfo = await rzp.payments.fetch(razorpay_payment_id);
        if (paymentInfo.status !== 'captured') {
             return res.status(400).json({ success: false, message: 'payment not captured' });
        }

        // DB से ऑर्डर और फ़ाइल खोजें
        const orderStmt = db.prepare("SELECT file_id FROM orders WHERE order_id = ?");
        const order = orderStmt.get(razorpay_order_id);
        if (!order) {
            return res.status(404).json({ success: false, message: 'order not found' });
        }

        const fileStmt = db.prepare("SELECT filename FROM files WHERE file_id = ?");
        const file = fileStmt.get(order.file_id);
        if (!file) {
            return res.status(404).json({ success: false, message: 'file not found' });
        }

        const filePath = path.join(config.protected_dir, file.filename);
        if (!require('fs').existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'file missing' });
        }

        // वन-टाइम टोकन बनाएँ
        const token = crypto.randomBytes(16).toString('hex');
        const expires = Math.floor(Date.now() / 1000) + config.download_ttl;

        // DB में टोकन डालें
        const tokenStmt = db.prepare("INSERT INTO tokens (token, file_path, expires_at) VALUES (?, ?, ?)");
        tokenStmt.run(token, filePath, expires);

        // क्लाइंट को टोकन भेजें
        res.json({ success: true, downloadToken: token, expiresIn: config.download_ttl });

    } catch (err) {
        console.error('Verification failed:', err);
        res.status(500).json({ success: false, message: 'server error', raw: err.message });
    }
});

// --- 3. फ़ाइल डाउनलोड करें (GET /download?token=...) ---
app.get('/download', (req, res) => {
    const { token } = req.query;
    if (!token) {
        return res.status(400).send('token required');
    }

    try {
        // DB से टोकन प्राप्त करें
        const stmt = db.prepare("SELECT file_path, expires_at FROM tokens WHERE token = ?");
        const row = stmt.get(token);

        if (!row) {
            return res.status(403).send('invalid or used token');
        }

        if (Date.now() / 1000 > row.expires_at) {
            // टोकन समाप्त हो गया है, इसे हटा दें
            db.prepare("DELETE FROM tokens WHERE token = ?").run(token);
            return res.status(403).send('token expired');
        }

        // वन-टाइम यूज़: टोकन को तुरंत हटा दें
        db.prepare("DELETE FROM tokens WHERE token = ?").run(token);

        const filePath = row.file_path;
        if (!require('fs').existsSync(filePath)) {
            return res.status(404).send('file not found');
        }

        // फ़ाइल भेजें (Express का res.download() हैडर सेट करता है)
        res.download(filePath, path.basename(filePath), (err) => {
            if (err) {
                console.error('Download error:', err);
            }
        });

    } catch (err) {
        console.error('Download processing error:', err);
        res.status(500).send('server error');
    }
});

// सर्वर शुरू करें
app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
});
