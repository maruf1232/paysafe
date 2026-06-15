const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const db = require('./db');

const bot = new Telegraf(process.env.MAIN_BOT_TOKEN);
const localSession = new LocalSession({ database: 'main_session_db.json' });
bot.use(localSession.middleware());

bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}:`, err);
    ctx.reply('❌ An internal error occurred. (Possible reason: Database tables are missing. Please complete the Supabase SQL setup!).').catch(() => {});
});

const ADMIN_CHANNEL_ID = '-1003838765118';

// Main Menu Keyboard
function getMainMenu() {
    return Markup.keyboard([
        ['💳 Paysafe', '💰 Deposit'],
        ['👤 Profile', '🎁 Refer', '❓ Help']
    ]).resize();
}

bot.start(async (ctx) => {
    let user = await db.getUser(ctx.from.id);
    
    // Check referral
    const args = ctx.message.text.split(' ');
    let referredBy = null;
    if (args.length > 1) {
        const refId = parseInt(args[1]);
        if (!isNaN(refId) && refId !== ctx.from.id) {
            referredBy = refId;
        }
    }

    if (!user) {
        user = await db.createUser(ctx.from.id, referredBy);
    }

    const welcomeMsg = `Welcome to Paysafe Digital Store, ${ctx.from.first_name}!\n\nBuy premium UK Paysafe accounts easily.`;
    const photoUrl = 'https://mms.businesswire.com/media/20240205162279/en/2021326/22/Paysafe_2024_Logo.jpg';
    
    await ctx.replyWithPhoto(photoUrl, { caption: welcomeMsg, ...getMainMenu() });
});

bot.hears('👤 Profile', async (ctx) => {
    const user = await db.getUser(ctx.from.id);
    const msg = `👤 <b>Your Premium Profile</b>\n\n<blockquote>🆔 <b>User ID:</b> <code>${user.telegram_id}</code>\n💰 <b>Available Balance:</b> ${user.balance} TK\n👥 <b>Total Referrals:</b> ${user.total_referrals}</blockquote>\n\n<i>Keep referring friends to earn more!</i>`;
    ctx.reply(msg, { parse_mode: 'HTML' });
});

bot.hears('🎁 Refer', async (ctx) => {
    const botInfo = await bot.telegram.getMe();
    const refLink = `https://t.me/${botInfo.username}?start=${ctx.from.id}`;
    const settings = await db.getSettings();
    const msg = `🎁 **Refer and Earn!**\n\nShare this link with your friends. \nFor your first 10 referrals, you get ${settings.referral_percentage}% of their first deposit! \nAfter that, you get ${settings.referral_fixed_bonus} TK per referral's first deposit.\n\nYour Link: ${refLink}`;
    ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.hears('❓ Help', (ctx) => {
    const msg = `❓ **Help Menu**\n\n- To buy an account, click '💳 Paysafe'.\n- To add funds, click '💰 Deposit'.\n- If you face any issues, contact the admin.`;
    ctx.reply(msg, { parse_mode: 'Markdown' });
});

function getPurchaseMessageAndKeyboard(price, balance) {
    const remaining = balance - price;
    
    const msg = `💳 **Paysafe Account Purchase**\n\nPrice per account: ${price} TK\n\n🛒 **Purchase Summary**\nQuantity: 1\nTotal Cost: ${price} TK\nYour Balance: ${balance} TK\nAfter Purchase: ${remaining} TK`;
    
    const kb = Markup.inlineKeyboard([
        [Markup.button.callback(`🛒 Buy (1)`, `buy_qty_1`)]
    ]);
    return { msg, kb };
}

bot.hears('💳 Paysafe', async (ctx) => {
    const settings = await db.getSettings();
    const user = await db.getUser(ctx.from.id);
    const price = parseFloat(settings.account_price);
    const balance = parseFloat(user.balance);
    
    const { msg, kb } = getPurchaseMessageAndKeyboard(price, balance);
    
    ctx.replyWithPhoto('https://mms.businesswire.com/media/20240205162279/en/2021326/22/Paysafe_2024_Logo.jpg', { caption: msg, parse_mode: 'Markdown', ...kb });
});


// OTP Tracking Map: { userId: { account: Object, attempts: number } }
const otpSessions = new Map();

bot.action(/^buy_qty_(\d+)$/, async (ctx) => {
    try {
        const qty = parseInt(ctx.match[1]);
        if (qty > 1) {
            return ctx.answerCbQuery('❌ You can only buy 1 account at a time for OTP verification.', { show_alert: true });
        }

        const user = await db.getUser(ctx.from.id);
        const settings = await db.getSettings();
        const price = parseFloat(settings.account_price);
        const totalCost = price;
        
        if (parseFloat(user.balance) < totalCost) {
            return ctx.answerCbQuery('❌ Insufficient balance.', { show_alert: true });
        }
        
        const sheets = require('./googleSheets');
        const account = await sheets.getAvailableAccount();
        
        if (!account) {
            bot.telegram.sendMessage(settings.admin_channel, '⚠️ Account stock is empty! Please add more accounts to the Google Sheet.');
            return ctx.answerCbQuery('❌ Out of stock! Admin has been notified.', { show_alert: true });
        }
        
        // Deduct balance
        const newBalance = parseFloat(user.balance) - totalCost;
        await db.updateUserBalance(ctx.from.id, newBalance);
        
        // Mark used
        await sheets.markAccountUsed(account.row);
        
        // Save session for OTP
        otpSessions.set(ctx.from.id, { account, attempts: 0 });
        
        const msg = `✅ <b>Purchase Successful!</b>\n\n` +
                    `<blockquote>📧 <b>Email:</b> <code>${account.email}</code>\n` +
                    `🔑 <b>Password:</b> <tg-spoiler>${account.password}</tg-spoiler>\n` +
                    `📱 <b>Phone No:</b> <code>${account.phoneNo}</code></blockquote>\n\n` +
                    `⚠️ <i>These accounts are temporary and strictly for Google free trials. DO NOT add money!</i>`;
        
        const kb = Markup.inlineKeyboard([
            [Markup.button.callback('📩 Get OTP', 'get_otp')]
        ]);
        
        // Edit media to show the success image
        await ctx.editMessageMedia({
            type: 'photo',
            media: 'https://cyrjsbfsfhcwocdqtkuv.supabase.co/storage/v1/object/public/Maruf/Paysafe%20buy%20account%20successs.png',
            caption: msg,
            parse_mode: 'HTML'
        }, { reply_markup: kb.reply_markup });
        
        await ctx.answerCbQuery('✅ Account purchased!');
    } catch (e) {
        console.error(e);
        ctx.answerCbQuery('❌ An error occurred.', { show_alert: true });
    }
});

const scraper = require('./scraper');

bot.action('get_otp', async (ctx) => {
    try {
        const session = otpSessions.get(ctx.from.id);
        if (!session) {
            return ctx.answerCbQuery('❌ Session expired or invalid. No active OTP request.', { show_alert: true });
        }
        
        session.attempts += 1;
        
        await ctx.answerCbQuery('⏳ Looking for OTP...', { show_alert: false }).catch(()=>{});
        const waitMsg = await ctx.reply('🔍 Looking for OTP .');
        
        let dots = 1;
        const animInterval = setInterval(() => {
            dots = (dots % 3) + 1;
            ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, '🔍 Looking for OTP ' + '.'.repeat(dots)).catch(()=>{});
        }, 2000);
        
        // Start scraping (checks for up to 2 mins)
        const msgText = await scraper.scrapeOTP(session.account.otpLink);
        
        clearInterval(animInterval);
        
        if (msgText) {
            // Success
            await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(()=>{});
            await ctx.reply(`✅ **OTP Found!**\n\n> \`${msgText}\``, { parse_mode: 'Markdown' });
            otpSessions.delete(ctx.from.id);
        } else {
            // Failed
            await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(()=>{});
            
            if (session.attempts >= 2) {
                // Auto replace
                const failMsg = await ctx.reply('❌ OTP not received after 2 attempts. 🔄 Getting a new account for you for FREE...');
                setTimeout(() => ctx.telegram.deleteMessage(ctx.chat.id, failMsg.message_id).catch(()=> {}), 10000);
                
                const sheets = require('./googleSheets');
                const newAccount = await sheets.getAvailableAccount();
                if (!newAccount) {
                    return ctx.reply('❌ Sorry, out of stock for replacement! Admin notified.');
                }
                
                await sheets.markAccountUsed(newAccount.row);
                otpSessions.set(ctx.from.id, { account: newAccount, attempts: 0 });
                
                const newMsg = `✅ <b>Replacement Successful!</b>\n\n` +
                               `<blockquote>📧 <b>Email:</b> <code>${newAccount.email}</code>\n` +
                               `🔑 <b>Password:</b> <tg-spoiler>${newAccount.password}</tg-spoiler>\n` +
                               `📱 <b>Phone No:</b> <code>${newAccount.phoneNo}</code></blockquote>\n\n` +
                               `⚠️ <i>These accounts are temporary and strictly for Google free trials. DO NOT add money!</i>`;
                
                const kb = Markup.inlineKeyboard([
                    [Markup.button.callback('📩 Get OTP', 'get_otp')]
                ]);
                
                await ctx.replyWithPhoto('https://cyrjsbfsfhcwocdqtkuv.supabase.co/storage/v1/object/public/Maruf/Paysafe%20buy%20account%20successs.png', { caption: newMsg, parse_mode: 'HTML', ...kb });
                
            } else {
                const retryMsg = await ctx.reply('❌ OTP not found after 2 minutes. Please send the OTP again from the Google page and click "Get OTP" here.');
                setTimeout(() => ctx.telegram.deleteMessage(ctx.chat.id, retryMsg.message_id).catch(()=> {}), 10000);
            }
        }
    } catch (e) {
        console.error(e);
        ctx.answerCbQuery('❌ An error occurred.', { show_alert: true }).catch(()=>{});
    }
});



const scraper = require('./scraper');

bot.action('get_otp', async (ctx) => {
    try {
        const session = otpSessions.get(ctx.from.id);
        if (!session) {
            return ctx.answerCbQuery('❌ Session expired or invalid. No active OTP request.', { show_alert: true });
        }
        
        session.attempts += 1;
        
        await ctx.answerCbQuery('⏳ Please wait up to 2 minutes...', { show_alert: true });
        const waitMsg = await ctx.reply('⏳ Please wait up to 2 minutes while I actively scan for your OTP...');
        
        // Start scraping (now checks for up to 2 mins)
        const msgText = await scraper.scrapeOTP(session.account.otpLink);
        
        if (msgText) {
            // Success
            await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(()=>{});
            await ctx.reply(`✅ **OTP Found!**\n\n> \`${msgText}\``, { parse_mode: 'Markdown' });
            otpSessions.delete(ctx.from.id);
        } else {
            // Failed
            await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(()=>{});
            
            if (session.attempts >= 2) {
                // Auto replace
                const failMsg = await ctx.reply('❌ OTP not received after 2 attempts. 🔄 Getting a new account for you for FREE...');
                setTimeout(() => ctx.telegram.deleteMessage(ctx.chat.id, failMsg.message_id).catch(()=> {}), 10000);
                
                const sheets = require('./googleSheets');
                const newAccount = await sheets.getAvailableAccount();
                if (!newAccount) {
                    return ctx.reply('❌ Sorry, out of stock for replacement! Admin notified.');
                }
                
                await sheets.markAccountUsed(newAccount.row);
                otpSessions.set(ctx.from.id, { account: newAccount, attempts: 0 });
                
                const newMsg = `✅ <b>Replacement Successful!</b>\n\n` +
                               `<blockquote>📧 <b>Email:</b> <code>${newAccount.email}</code>\n` +
                               `🔑 <b>Password:</b> <tg-spoiler>${newAccount.password}</tg-spoiler>\n` +
                               `📱 <b>Phone No:</b> <code>${newAccount.phoneNo}</code></blockquote>\n\n` +
                               `⚠️ <i>These accounts are temporary and strictly for Google free trials. DO NOT add money!</i>`;
                
                const kb = Markup.inlineKeyboard([
                    [Markup.button.callback('📩 Get OTP', 'get_otp')]
                ]);
                
                await ctx.replyWithPhoto('https://cyrjsbfsfhcwocdqtkuv.supabase.co/storage/v1/object/public/Maruf/Paysafe%20buy%20account%20successs.png', { caption: newMsg, parse_mode: 'HTML', ...kb });
                
            } else {
                const retryMsg = await ctx.reply('❌ OTP not found after 2 minutes. Please send the OTP again from the Google page and click "Get OTP" here.');
                setTimeout(() => ctx.telegram.deleteMessage(ctx.chat.id, retryMsg.message_id).catch(()=> {}), 10000);
            }
        }
    } catch (e) {
        console.error(e);
        ctx.answerCbQuery('❌ An error occurred.', { show_alert: true });
    }
});


bot.action('dep_bkash', (ctx) => {
    ctx.session.depositMethod = 'bkash';
    ctx.session.state = 'DEPOSIT_TRXID';
    ctx.reply('📱 **bKash Personal:** `01752561935`\n\nPlease Send Money to this number and reply with the TrxID.', { parse_mode: 'Markdown' });
});

bot.action('dep_nagad', (ctx) => {
    ctx.session.depositMethod = 'nagad';
    ctx.session.state = 'DEPOSIT_TRXID';
    ctx.reply('📱 **Nagad Personal:** `01878580320`\n\nPlease Send Money to this number and reply with the TrxID.', { parse_mode: 'Markdown' });
});

// Auto verification listener
bot.on('channel_post', async (ctx) => {
    const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID || '-1003838765118';
    if (ctx.chat.id.toString() !== ADMIN_CHANNEL_ID) return;
    
    const text = ctx.channelPost.text || '';
    
    const trxMatch = text.match(/\b([A-Z0-9]{8,12})\b/);
    const amtMatch = text.match(/(?:Tk|BDT|Amount|Ammount|৳)\s*[:.-]?\s*([\d,]+(?:\.\d+)?)/i);
    
    if (trxMatch && amtMatch) {
        const trxId = trxMatch[1];
        const amountStr = amtMatch[1].replace(/,/g, '');
        const amount = parseFloat(amountStr);
        
        if (!isNaN(amount) && amount > 0) {
            await db.saveChannelTransaction(trxId, amount);
        }
    }
});

// Attach a method to broadcast
process.sendBroadcast = async (text, photoFileId) => {
    console.log('Starting broadcast...');
    const userIds = await require('./db').getAllUserIds();
    let success = 0;
    let fail = 0;
    
    for (const uid of userIds) {
        try {
            if (photoFileId) {
                await bot.telegram.sendPhoto(uid, photoFileId, { caption: text, parse_mode: 'Markdown' });
            } else {
                await bot.telegram.sendMessage(uid, text, { parse_mode: 'Markdown' });
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
        await bot.telegram.sendMessage(process.env.ADMIN_CHANNEL_ID || '-1003838765118', `📢 Broadcast Report:\n✅ Success: ${success}\n❌ Failed: ${fail}`);
    } catch(e) {}
};

module.exports = bot;
