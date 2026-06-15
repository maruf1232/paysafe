const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const db = require('./db');

const bot = new Telegraf(process.env.ADMIN_BOT_TOKEN, { handlerTimeout: 300000 });
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
    'temp_1': { title: '🎁 Mega Discount', text: '📢 <b>Official Update</b>\n\n🎁 <b>MEGA DISCOUNT OFFER!</b>\n\nThe price of premium UK Paysafe accounts has just dropped!\n\n<blockquote><s>500 TK</s> 👉 <b>200 TK Only!</b></blockquote>\n\n🔥 Buy now before the stock runs out!' },
    'temp_2': { title: '💳 Stock Alert', text: '📢 <b>Official Update</b>\n\n💳 <b>NEW ACCOUNTS ADDED!</b>\n\nFresh premium UK Paysafe accounts are now available in stock.\n\n<blockquote>✅ <b>100% Verified Accounts</b>\n✅ <b>Instant Delivery</b></blockquote>\n\nGrab yours quickly!' },
    'temp_3': { title: '⚠️ Important Notice', text: '📢 <b>Official Update</b>\n\n⚠️ <b>IMPORTANT NOTICE</b>\n\nPlease make sure to use valid TrxIDs when depositing. Fake TrxIDs will lead to a ban.\n\n<blockquote><i>Thank you for your cooperation!</i></blockquote>' },
    'temp_4': { title: '🎁 Bonus Offer', text: '📢 <b>Official Update</b>\n\n🎁 <b>DEPOSIT BONUS!</b>\n\nDeposit today and get an extra 10% bonus added to your balance automatically!\n\n<blockquote>⏳ <i>Offer valid for a limited time only.</i></blockquote>' },
    'temp_5': { title: '⚙️ Maintenance', text: '📢 <b>Official Update</b>\n\n⚙️ <b>SYSTEM MAINTENANCE</b>\n\nThe bot will undergo short maintenance soon to upgrade our servers. We will be back online shortly!' },
    'temp_6': { title: '⚡ Fast Deposit', text: '📢 <b>Official Update</b>\n\n⚡ <b>INSTANT DEPOSITS</b>\n\nOur deposit verification system has been upgraded! Your deposits will now be verified even faster.' },
    'temp_7': { title: '🏆 Ref Contest', text: '📢 <b>Official Update</b>\n\n🏆 <b>REFERRAL CONTEST!</b>\n\nInvite the most users this week and win a special cash prize directly to your balance!' },
    'temp_8': { title: '🔥 Flash Sale', text: '📢 <b>Official Update</b>\n\n🔥 <b>WEEKEND FLASH SALE!</b>\n\nEnjoy discounted prices all weekend long on bulk purchases.' },
    'temp_9': { title: '💎 Top Buyer', text: '📢 <b>Official Update</b>\n\n💎 <b>TOP BUYER REWARDS!</b>\n\nOur most loyal customers will receive a free account at the end of this month!' },
    'temp_10': { title: '🎉 Giveaway', text: '📢 <b>Official Update</b>\n\n🎉 <b>EXCLUSIVE GIVEAWAY!</b>\n\nParticipate in our new giveaway event on our channel and win free Paysafe accounts!' }
};

function getAdminKeyboard() {
    return Markup.keyboard([
        ['💰 Change Price', '🔄 Checking'],
        ['👥 User Stats', '📊 Account Stats'],
        ['🔗 Ref Settings', '📢 Broadcast', '📝 Templates']
    ]).resize();
}

function showAdminMenu(ctx) {
    ctx.session.state = null;
    ctx.session.broadcastDraft = null;
    return ctx.reply('👨‍💻 **Admin Control Panel**\nChoose an option below:', { parse_mode: 'HTML', ...getAdminKeyboard() });
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

bot.hears('🔄 Checking', async (ctx) => {
    if (!authedUsers.has(ctx.from.id)) return;
    const sheets = require('./googleSheets');
    try {
        const count = await sheets.countAvailableStock();
        if (count > 0) {
            ctx.reply(`✅ Thanks! New accounts have been detected. \nAvailable Stock: ${count}`, getAdminKeyboard());
        } else {
            ctx.reply(`⚠️ Account stock is still empty! Please add more accounts to the Google Sheet and make sure the checkboxes are empty.`, getAdminKeyboard());
        }
    } catch (e) {
        ctx.reply(`Error checking Google Sheet: ${e.message}`, getAdminKeyboard());
    }
});

bot.hears('👥 User Stats', async (ctx) => {
    if (!authedUsers.has(ctx.from.id)) return;
    const count = await db.getTotalUsersCount();
    ctx.reply(`Total Users: ${count}`, getAdminKeyboard());
});

bot.hears('📊 Account Stats', async (ctx) => {
    if (!authedUsers.has(ctx.from.id)) return;
    const sheets = require('./googleSheets');
    try {
        const count = await sheets.countAvailableStock();
        ctx.reply(`📊 Accounts Stats:\nAvailable in Google Sheet: ${count}`, getAdminKeyboard());
    } catch (e) {
        ctx.reply(`Error reading stats: ${e.message}`, getAdminKeyboard());
    }
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
        ctx.replyWithPhoto(draft.photo, { caption: text, parse_mode: 'HTML', ...kb });
    } else {
        ctx.reply(text, { parse_mode: 'HTML', ...kb });
    }
}

bot.action('draft_edit_text', (ctx) => {
    ctx.session.state = 'WAITING_FOR_DRAFT_TEXT';
    const draftText = ctx.session.broadcastDraft?.text || '';
    ctx.reply('Tap the text below to copy it, then edit and send it back:\n\n```\n' + draftText + '\n```', { parse_mode: 'HTML' });
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
        ctx.reply('Broadcast is processing in the background... You will receive a message here when it is done.', getAdminKeyboard());
        process.sendBroadcast(draft.text, draft.photo, ctx.chat.id);
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
            
            ctx.reply('☁️ Uploading image to Supabase...');
            try {
                const link = await ctx.telegram.getFileLink(photoId);
                const res = await fetch(link.href);
                const buffer = await res.arrayBuffer();
                const fileName = `broadcast_${Date.now()}.jpg`;
                
                const db = require('./db');
                const { error } = await db.supabase.storage.from('image').upload(fileName, buffer, {
                    contentType: 'image/jpeg'
                });
                
                if (error) {
                    console.error('Supabase upload error:', error);
                    return ctx.reply('Failed to upload image to Supabase Bucket. Make sure bucket named "image" is created and public.');
                }
                
                const { data: publicData } = db.supabase.storage.from('image').getPublicUrl(fileName);
                
                if (ctx.session.broadcastDraft) {
                    ctx.session.broadcastDraft.photo = publicData.publicUrl;
                    ctx.session.state = null;
                    return sendBroadcastDraftPreview(ctx);
                }
            } catch (err) {
                console.error(err);
                return ctx.reply('Failed to upload image.');
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



    if (state === 'WAITING_FOR_BROADCAST' && ctx.message.text) {
        const msg = ctx.message.text;
        ctx.session.state = null;
        ctx.reply('Broadcast started... You will receive a message here when it is done.', getAdminKeyboard());
        if (process.sendBroadcast) {
            process.sendBroadcast(msg, null, ctx.chat.id);
            return;
        } else {
            return ctx.reply('Broadcast function not available.', getAdminKeyboard());
        }
    }
    
    return next();
});

module.exports = bot;
