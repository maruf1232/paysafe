const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const db = require('./db');

const bot = new Telegraf(process.env.ADMIN_BOT_TOKEN);
const localSession = new LocalSession({ database: 'admin_session_db.json' });
bot.use(localSession.middleware());

// Simple in-memory auth for admin
const authedUsers = new Set();
const PASSCODE = 'maruf1232';

function getAdminKeyboard() {
    return Markup.keyboard([
        ['💰 Change Price', '➕ Add Account'],
        ['👥 User Stats', '📊 Account Stats'],
        ['🔗 Ref Settings', '📢 Broadcast']
    ]).resize();
}

function showAdminMenu(ctx) {
    ctx.session.state = null;
    return ctx.reply('👨‍💻 **Admin Control Panel**\nChoose an option below:', { parse_mode: 'Markdown', ...getAdminKeyboard() });
}

bot.start((ctx) => {
    if (authedUsers.has(ctx.from.id)) {
        return showAdminMenu(ctx);
    }
    ctx.reply('Welcome Admin. Please enter your passcode to access the control panel:', Markup.removeKeyboard());
});

// Admin Keyboard Handlers
bot.hears('💰 Change Price', async (ctx) => {
    if (!authedUsers.has(ctx.from.id)) return;
    const settings = await db.getSettings();
    ctx.session.state = 'WAITING_FOR_PRICE';
    ctx.reply(`Current price is: ${settings.account_price} TK.\nEnter new price:`, Markup.removeKeyboard());
});

bot.hears('➕ Add Account', (ctx) => {
    if (!authedUsers.has(ctx.from.id)) return;
    ctx.session.state = 'WAITING_FOR_ACCOUNT';
    const msg = `Send the accounts in this format:\n\n\`email--password,email2--password\`\n\nExample:\n\`maruf@gmail.com--Maruf1232,sakib@gmail.com--Sakib1233\``;
    ctx.reply(msg, { parse_mode: 'Markdown', ...Markup.removeKeyboard() });
});

bot.hears('👥 User Stats', async (ctx) => {
    if (!authedUsers.has(ctx.from.id)) return;
    const count = await db.getTotalUsersCount();
    ctx.reply(`Total Users: ${count}`, getAdminKeyboard());
});

bot.hears('📊 Account Stats', async (ctx) => {
    if (!authedUsers.has(ctx.from.id)) return;
    const total = await db.getTotalAccountsCount();
    const available = await db.getAvailableAccountsCount();
    ctx.reply(`Accounts Stats:\nTotal Added: ${total}\nAvailable: ${available}\nSold: ${total - available}`, getAdminKeyboard());
});

bot.hears('🔗 Ref Settings', async (ctx) => {
    if (!authedUsers.has(ctx.from.id)) return;
    const settings = await db.getSettings();
    const msg = `Current Referral Settings:\n- First 10 refs: ${settings.referral_percentage}%\n- After 10 refs: ${settings.referral_fixed_bonus} TK\n\nWhat do you want to change?`;
    const kb = Markup.inlineKeyboard([
        [Markup.button.callback('Change Percentage (%)', 'change_ref_pct')],
        [Markup.button.callback('Change Fixed Bonus (TK)', 'change_ref_fixed')]
    ]);
    ctx.reply(msg, kb);
});

bot.action('change_ref_pct', (ctx) => {
    ctx.session.state = 'WAITING_FOR_REF_PERCENT';
    ctx.reply('Enter new referral percentage (e.g. 5):');
});

bot.action('change_ref_fixed', (ctx) => {
    ctx.session.state = 'WAITING_FOR_REF_FIXED';
    ctx.reply('Enter new fixed bonus amount in TK (e.g. 2):');
});

bot.hears('📢 Broadcast', (ctx) => {
    if (!authedUsers.has(ctx.from.id)) return;
    ctx.session.state = 'WAITING_FOR_BROADCAST';
    ctx.reply('Send the message you want to broadcast to all users:', Markup.removeKeyboard());
});

bot.on('text', async (ctx, next) => {
    if (!authedUsers.has(ctx.from.id)) {
        if (ctx.message.text === PASSCODE) {
            authedUsers.add(ctx.from.id);
            ctx.reply('Passcode accepted! Access granted.');
            return showAdminMenu(ctx);
        } else {
            return ctx.reply('Incorrect passcode. Try again.');
        }
    }
    
    const state = ctx.session?.state;
    if (!state) return next();

    // Handle specific states
    if (state === 'WAITING_FOR_PRICE') {
        const price = parseFloat(ctx.message.text);
        if (!isNaN(price)) {
            await db.updateSetting('account_price', price);
            ctx.session.state = null;
            return ctx.reply(`Account price successfully updated to ${price} TK.`, getAdminKeyboard());
        } else {
            return ctx.reply('Invalid number. Please enter a valid price:');
        }
    }
    
    if (state === 'WAITING_FOR_REF_PERCENT') {
        const pct = parseFloat(ctx.message.text);
        if (!isNaN(pct)) {
            await db.updateSetting('referral_percentage', pct);
            ctx.session.state = null;
            return ctx.reply(`Referral percentage updated to ${pct}%.`, getAdminKeyboard());
        }
    }
    
    if (state === 'WAITING_FOR_REF_FIXED') {
        const fixed = parseFloat(ctx.message.text);
        if (!isNaN(fixed)) {
            await db.updateSetting('referral_fixed_bonus', fixed);
            ctx.session.state = null;
            return ctx.reply(`Referral fixed bonus updated to ${fixed} TK.`, getAdminKeyboard());
        }
    }

    if (state === 'WAITING_FOR_ACCOUNT') {
        const text = ctx.message.text;
        // Format: email--password,email2--password
        const accountsStr = text.split(',');
        let addedCount = 0;
        
        for (let acc of accountsStr) {
            if (acc.includes('--')) {
                const parts = acc.split('--');
                const email = parts[0].trim();
                const password = parts.slice(1).join('--').trim(); // in case password has --
                
                if (email && password) {
                    await db.addAccount(email, password);
                    addedCount++;
                }
            }
        }

        ctx.session.state = null;
        if (addedCount > 0) {
            return ctx.reply(`Successfully added ${addedCount} account(s)!`, getAdminKeyboard());
        } else {
            return ctx.reply('Invalid format or no accounts found. Try again via "Add Account" button.', getAdminKeyboard());
        }
    }

    if (state === 'WAITING_FOR_BROADCAST') {
        const msg = ctx.message.text;
        ctx.session.state = null;
        ctx.reply('Broadcast started... (Check server logs for progress)', getAdminKeyboard());
        if (process.sendBroadcast) {
            process.sendBroadcast(msg);
            return;
        } else {
            return ctx.reply('Broadcast function not available.', getAdminKeyboard());
        }
    }
    
    return next();
});

module.exports = bot;
