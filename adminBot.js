const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const db = require('./db');

const bot = new Telegraf(process.env.ADMIN_BOT_TOKEN);
const localSession = new LocalSession({ database: 'admin_session_db.json' });
bot.use(localSession.middleware());

// Simple in-memory auth for admin
const authedUsers = new Set();
const PASSCODE = 'maruf1232';

function showAdminMenu(ctx) {
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('💰 Change Price', 'change_price'), Markup.button.callback('➕ Add Account', 'add_account')],
        [Markup.button.callback('👥 User Stats', 'user_stats'), Markup.button.callback('📊 Account Stats', 'account_stats')],
        [Markup.button.callback('🔗 Ref Settings', 'ref_settings'), Markup.button.callback('📢 Broadcast', 'broadcast')]
    ]);
    return ctx.reply('👨‍💻 **Admin Control Panel**\nChoose an option below:', { parse_mode: 'Markdown', ...keyboard });
}

bot.start((ctx) => {
    if (authedUsers.has(ctx.from.id)) {
        return showAdminMenu(ctx);
    }
    ctx.reply('Welcome Admin. Please enter your passcode to access the control panel:');
});

bot.action('admin_menu', (ctx) => {
    ctx.session.state = null;
    showAdminMenu(ctx);
});

bot.action('change_price', async (ctx) => {
    const settings = await db.getSettings();
    ctx.session.state = 'WAITING_FOR_PRICE';
    ctx.reply(`Current price is: ${settings.account_price} TK.\nEnter new price:`);
});

bot.action('add_account', (ctx) => {
    ctx.session.state = 'WAITING_FOR_ACCOUNT';
    ctx.reply('Send the account details in this format:\n`email:password`', { parse_mode: 'Markdown' });
});

bot.action('user_stats', async (ctx) => {
    const count = await db.getTotalUsersCount();
    ctx.reply(`Total Users: ${count}`, Markup.inlineKeyboard([Markup.button.callback('Back to Menu', 'admin_menu')]));
});

bot.action('account_stats', async (ctx) => {
    const total = await db.getTotalAccountsCount();
    const available = await db.getAvailableAccountsCount();
    ctx.reply(`Accounts Stats:\nTotal Added: ${total}\nAvailable: ${available}\nSold: ${total - available}`, Markup.inlineKeyboard([Markup.button.callback('Back to Menu', 'admin_menu')]));
});

bot.action('ref_settings', async (ctx) => {
    const settings = await db.getSettings();
    const msg = `Current Referral Settings:\n- First 10 refs: ${settings.referral_percentage}%\n- After 10 refs: ${settings.referral_fixed_bonus} TK\n\nWhat do you want to change?`;
    const kb = Markup.inlineKeyboard([
        [Markup.button.callback('Change Percentage (%)', 'change_ref_pct')],
        [Markup.button.callback('Change Fixed Bonus (TK)', 'change_ref_fixed')],
        [Markup.button.callback('Back to Menu', 'admin_menu')]
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

bot.action('broadcast', (ctx) => {
    ctx.session.state = 'WAITING_FOR_BROADCAST';
    ctx.reply('Send the message you want to broadcast to all users:');
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
    
    // Handle specific states
    if (ctx.session?.state === 'WAITING_FOR_PRICE') {
        const price = parseFloat(ctx.message.text);
        if (!isNaN(price)) {
            await db.updateSetting('account_price', price);
            ctx.session.state = null;
            return ctx.reply(`Account price successfully updated to ${price} TK.`, Markup.inlineKeyboard([Markup.button.callback('Back to Menu', 'admin_menu')]));
        } else {
            return ctx.reply('Invalid number. Please enter a valid price:');
        }
    }
    
    if (ctx.session?.state === 'WAITING_FOR_REF_PERCENT') {
        const pct = parseFloat(ctx.message.text);
        if (!isNaN(pct)) {
            await db.updateSetting('referral_percentage', pct);
            ctx.session.state = null;
            return ctx.reply(`Referral percentage updated to ${pct}%.`, Markup.inlineKeyboard([Markup.button.callback('Back to Menu', 'admin_menu')]));
        }
    }
    
    if (ctx.session?.state === 'WAITING_FOR_REF_FIXED') {
        const fixed = parseFloat(ctx.message.text);
        if (!isNaN(fixed)) {
            await db.updateSetting('referral_fixed_bonus', fixed);
            ctx.session.state = null;
            return ctx.reply(`Referral fixed bonus updated to ${fixed} TK.`, Markup.inlineKeyboard([Markup.button.callback('Back to Menu', 'admin_menu')]));
        }
    }

    if (ctx.session?.state === 'WAITING_FOR_ACCOUNT') {
        const text = ctx.message.text;
        if (text.includes(':')) {
            const [email, ...passParts] = text.split(':');
            const password = passParts.join(':'); // in case password has colon
            await db.addAccount(email.trim(), password.trim());
            ctx.session.state = null;
            return ctx.reply(`Account added successfully: ${email}`, Markup.inlineKeyboard([Markup.button.callback('Back to Menu', 'admin_menu')]));
        } else {
            return ctx.reply('Invalid format. Please send as email:password');
        }
    }

    if (ctx.session?.state === 'WAITING_FOR_BROADCAST') {
        const msg = ctx.message.text;
        ctx.session.state = null;
        ctx.reply('Broadcast started... (Check server logs for progress)');
        if (process.sendBroadcast) {
            process.sendBroadcast(msg);
            return ctx.reply('Broadcast message sent to processing queue.', Markup.inlineKeyboard([Markup.button.callback('Back to Menu', 'admin_menu')]));
        } else {
            return ctx.reply('Broadcast function not available.', Markup.inlineKeyboard([Markup.button.callback('Back to Menu', 'admin_menu')]));
        }
    }
    
    return next();
});

module.exports = bot;
