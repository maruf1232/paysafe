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
