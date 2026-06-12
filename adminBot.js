const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const db = require('./db');

const bot = new Telegraf(process.env.ADMIN_BOT_TOKEN);
const localSession = new LocalSession({ database: 'admin_session_db.json' });
bot.use(localSession.middleware());

bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}:`, err);
    ctx.reply('❌ An internal error occurred. Please check server logs.').catch(() => {});
});

// Simple in-memory auth for admin
const authedUsers = new Set();
const PASSCODE = 'maruf1232';

const BROADCAST_TEMPLATES = {
    'temp_1': { title: '🔥 Price Drop', text: '🔥 **Special Offer!**\n\nThe price of premium UK Paysafe accounts has just dropped! Buy now before the stock runs out!' },
    'temp_2': { title: '🎁 Mega Offer', text: '🎁 **Mega Discount Offer!**\n\nDeposit today and get an extra bonus on your referrals!' },
    'temp_3': { title: '💳 Stock Update', text: '💳 **New Accounts Added!**\n\nFresh premium UK Paysafe accounts are now available in stock. Grab yours quickly!' },
    'temp_4': { title: '⚠️ Maintenance', text: '⚠️ **Bot Maintenance**\n\nThe bot will undergo short maintenance soon. We will be back online shortly!' },
    'temp_5': { title: '🎉 Giveaway', text: '🎉 **Exclusive Giveaway!**\n\nParticipate in our new giveaway and win free Paysafe accounts!' },
    'temp_6': { title: '⚡ Fast Deposit', text: '⚡ **Instant Deposit Enabled!**\n\nYour deposits will now be verified even faster!' },
    'temp_7': { title: '👥 Ref Contest', text: '👥 **Referral Contest!**\n\nInvite the most users this week and win a special cash prize!' },
    'temp_8': { title: '✨ Weekend Sale', text: '✨ **Weekend Flash Sale!**\n\nEnjoy discounted prices all weekend long!' },
    'temp_9': { title: '🏆 Top Buyer', text: '🏆 **Top Buyer Rewards!**\n\nOur most loyal customers will receive a free account this month!' },
    'temp_10': { title: '🔔 Notice', text: '🔔 **Important Notice**\n\nPlease make sure to use valid TrxIDs when depositing. Fake TrxIDs will lead to a ban.' }
};

function getAdminKeyboard() {
    return Markup.keyboard([
        ['💰 Change Price', '➕ Add Account'],
        ['👥 User Stats', '📊 Account Stats'],
        ['🔗 Ref Settings', '📢 Broadcast', '📝 Templates']
    ]).resize();
}

function showAdminMenu(ctx) {
    ctx.session.state = null;
    ctx.session.broadcastDraft = null;
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
    const msg = `Send the accounts in this format:\n\n\`email=password,email2=password\`\n\nExample:\n\`maruf@gmail.com=Maruf1232,sakib@gmail.com=Sakib1233\``;
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
    ctx.answerCbQuery();
});

bot.action('change_ref_fixed', (ctx) => {
    ctx.session.state = 'WAITING_FOR_REF_FIXED';
    ctx.reply('Enter new fixed bonus amount in TK (e.g. 2):');
    ctx.answerCbQuery();
});

bot.hears('📢 Broadcast', (ctx) => {
    if (!authedUsers.has(ctx.from.id)) return;
    ctx.session.state = 'WAITING_FOR_BROADCAST';
    ctx.reply('Send the message you want to broadcast to all users:', Markup.removeKeyboard());
});

// Broadcast Templates Logic
bot.hears('📝 Templates', (ctx) => {
    if (!authedUsers.has(ctx.from.id)) return;
    const buttons = [];
    let row = [];
    Object.keys(BROADCAST_TEMPLATES).forEach((key) => {
        row.push(Markup.button.callback(BROADCAST_TEMPLATES[key].title, `use_temp_${key}`));
        if (row.length === 2) {
            buttons.push(row);
            row = [];
        }
    });
    if (row.length > 0) buttons.push(row);
    
    ctx.reply('Select a broadcast template to preview and edit:', Markup.inlineKeyboard(buttons));
});

bot.action(/use_temp_(.+)/, (ctx) => {
    const tempKey = ctx.match[1];
    const template = BROADCAST_TEMPLATES[tempKey];
    if (!template) return ctx.answerCbQuery('Template not found');
    
    ctx.session.broadcastDraft = {
        text: template.text,
        photo: null
    };
    
    ctx.answerCbQuery();
    sendBroadcastDraftPreview(ctx);
});

function sendBroadcastDraftPreview(ctx) {
    const draft = ctx.session.broadcastDraft;
    if (!draft) return;
    
    const text = `**--- DRAFT PREVIEW ---**\n\n${draft.text}\n\n**--- END PREVIEW ---**\n\nYou can edit the text, attach an image, or send it now.`;
    const kb = Markup.inlineKeyboard([
        [Markup.button.callback('✏️ Edit Text', 'draft_edit_text'), Markup.button.callback('🖼️ Set Image', 'draft_set_image')],
        [Markup.button.callback('🗑️ Remove Image', 'draft_remove_image'), Markup.button.callback('🚀 SEND NOW', 'draft_send')],
        [Markup.button.callback('❌ Cancel', 'draft_cancel')]
    ]);
    
    if (draft.photo) {
        ctx.replyWithPhoto(draft.photo, { caption: text, parse_mode: 'Markdown', ...kb });
    } else {
        ctx.reply(text, { parse_mode: 'Markdown', ...kb });
    }
}

bot.action('draft_edit_text', (ctx) => {
    ctx.session.state = 'WAITING_FOR_DRAFT_TEXT';
    ctx.reply('Please type the new text for this broadcast:', Markup.removeKeyboard());
    ctx.answerCbQuery();
});

bot.action('draft_set_image', (ctx) => {
    ctx.session.state = 'WAITING_FOR_DRAFT_IMAGE';
    ctx.reply('Please send the photo for this broadcast:', Markup.removeKeyboard());
    ctx.answerCbQuery();
});

bot.action('draft_remove_image', (ctx) => {
    if (ctx.session.broadcastDraft) {
        ctx.session.broadcastDraft.photo = null;
    }
    ctx.answerCbQuery('Image removed');
    sendBroadcastDraftPreview(ctx);
});

bot.action('draft_send', async (ctx) => {
    ctx.answerCbQuery('Sending broadcast...');
    const draft = ctx.session.broadcastDraft;
    if (draft && process.sendBroadcast) {
        ctx.reply('Broadcast is processing in the background... You will be notified in the channel when it is done.', getAdminKeyboard());
        process.sendBroadcast(draft.text, draft.photo);
        ctx.session.broadcastDraft = null;
    } else {
        ctx.reply('Failed to send broadcast or broadcast feature is unavailable.', getAdminKeyboard());
    }
});

bot.action('draft_cancel', (ctx) => {
    ctx.session.broadcastDraft = null;
    ctx.session.state = null;
    ctx.answerCbQuery('Cancelled.');
    ctx.reply('Draft discarded.', getAdminKeyboard());
});

bot.on('message', async (ctx, next) => {
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

    // Draft specific states
    if (state === 'WAITING_FOR_DRAFT_TEXT' && ctx.message.text) {
        if (ctx.session.broadcastDraft) {
            ctx.session.broadcastDraft.text = ctx.message.text;
            ctx.session.state = null;
            return sendBroadcastDraftPreview(ctx);
        }
    }

    if (state === 'WAITING_FOR_DRAFT_IMAGE') {
        if (ctx.message.photo && ctx.message.photo.length > 0) {
            const photoArray = ctx.message.photo;
            const photoId = photoArray[photoArray.length - 1].file_id;
            if (ctx.session.broadcastDraft) {
                ctx.session.broadcastDraft.photo = photoId;
                ctx.session.state = null;
                return sendBroadcastDraftPreview(ctx);
            }
        } else {
            return ctx.reply('Please send a valid photo/image.');
        }
    }

    if (state === 'WAITING_FOR_PRICE' && ctx.message.text) {
        const price = parseFloat(ctx.message.text);
        if (!isNaN(price)) {
            await db.updateSetting('account_price', price);
            ctx.session.state = null;
            return ctx.reply(`Account price successfully updated to ${price} TK.`, getAdminKeyboard());
        } else {
            return ctx.reply('Invalid number. Please enter a valid price:');
        }
    }
    
    if (state === 'WAITING_FOR_REF_PERCENT' && ctx.message.text) {
        const pct = parseFloat(ctx.message.text);
        if (!isNaN(pct)) {
            await db.updateSetting('referral_percentage', pct);
            ctx.session.state = null;
            return ctx.reply(`Referral percentage updated to ${pct}%.`, getAdminKeyboard());
        }
    }
    
    if (state === 'WAITING_FOR_REF_FIXED' && ctx.message.text) {
        const fixed = parseFloat(ctx.message.text);
        if (!isNaN(fixed)) {
            await db.updateSetting('referral_fixed_bonus', fixed);
            ctx.session.state = null;
            return ctx.reply(`Referral fixed bonus updated to ${fixed} TK.`, getAdminKeyboard());
        }
    }

    if (state === 'WAITING_FOR_ACCOUNT' && ctx.message.text) {
        const text = ctx.message.text;
        // Format: email=password,email2=password
        const accountsStr = text.split(',');
        let addedCount = 0;
        
        for (let acc of accountsStr) {
            if (acc.includes('=')) {
                const parts = acc.split('=');
                const email = parts[0].trim();
                const password = parts.slice(1).join('=').trim(); // in case password has =
                
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

    if (state === 'WAITING_FOR_BROADCAST' && ctx.message.text) {
        const msg = ctx.message.text;
        ctx.session.state = null;
        ctx.reply('Broadcast started... You will be notified in the admin channel when finished.', getAdminKeyboard());
        if (process.sendBroadcast) {
            process.sendBroadcast(msg, null);
            return;
        } else {
            return ctx.reply('Broadcast function not available.', getAdminKeyboard());
        }
    }
    
    return next();
});

module.exports = bot;
