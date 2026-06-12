require('dotenv').config();
const express = require('express');
const mainBot = require('./mainBot');
const adminBot = require('./adminBot');

const app = express();

// Simple endpoint for Render to ping and keep the service alive
app.get('/', (req, res) => {
    res.send('Paysafe Telegram Bots are running!');
});

const PORT = process.env.PORT || 3000;

process.sendBroadcast = async (text, photoFileId) => {
    console.log('Starting broadcast...');
    const userIds = await require('./db').getAllUserIds();
    let success = 0;
    let fail = 0;
    
    for (const uid of userIds) {
        try {
            if (photoFileId) {
                await mainBot.telegram.sendPhoto(uid, photoFileId, { caption: text, parse_mode: 'Markdown' });
            } else {
                await mainBot.telegram.sendMessage(uid, text, { parse_mode: 'Markdown' });
            }
            success++;
        } catch (e) {
            fail++;
        }
        await new Promise(resolve => setTimeout(resolve, 50)); // 50ms delay to avoid rate limits
    }
    
    console.log(`Broadcast finished. Success: ${success}, Fail: ${fail}`);
    // Optionally notify the admin channel or specific admin
    try {
        await adminBot.telegram.sendMessage(process.env.ADMIN_CHANNEL_ID || '-1003838765118', `📢 Broadcast Report:\n✅ Success: ${success}\n❌ Failed: ${fail}`);
    } catch(e) {}
};

app.listen(PORT, async () => {
    console.log(`Web server is listening on port ${PORT}`);
    
    // Launch bots
    mainBot.launch().then(() => {
        console.log('Main Bot is running.');
    }).catch(e => {
        console.error('Failed to launch Main Bot:', e);
    });
    
    adminBot.launch().then(() => {
        console.log('Admin Bot is running.');
    }).catch(e => {
        console.error('Failed to launch Admin Bot:', e);
    });
});

// Enable graceful stop
process.once('SIGINT', () => {
    mainBot.stop('SIGINT');
    adminBot.stop('SIGINT');
});
process.once('SIGTERM', () => {
    mainBot.stop('SIGTERM');
    adminBot.stop('SIGTERM');
});
