// config.js
const path = require('path');

module.exports = {
    // अपनी Razorpay keys से बदलें
    rzp_key_id: 'rzp_test_Rfuvem0Ql6y6xJ',
    rzp_key_secret: 'be8GFXsfwqPS2gdEOwYe7Tz4',

    // टोकन TTL (सेकंड) - डाउनलोड टोकन कितनी देर तक मान्य है
    download_ttl: 300, // 5 मिनट

    // सुरक्षित फ़ाइलों का पाथ
    protected_dir: path.join(__dirname, 'protected_files'),

    // sqlite DB का पाथ
    sqlite_db: path.join(__dirname, 'data', 'db.sqlite'),

    // आपका डिप्लॉयड सर्वर का बेस URL (Render पर डिप्लॉय करने के बाद सेट करें)
    base_url: 'https://your-node-project.onrender.com'
};
