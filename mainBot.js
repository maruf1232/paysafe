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
    if (!user) return ctx.reply('Please /start the bot first.');
    const msg = `👤 **Your Profile**\n\nID: \`${user.telegram_id}\`\nBalance: ${user.balance} TK\nTotal Referrals: ${user.total_referrals}`;
    ctx.reply(msg, { parse_mode: 'Markdown' });
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

bot.hears('💳 Paysafe', async (ctx) => {
    const settings = await db.getSettings();
    const msg = `💳 **Paysafe Account**\n\nPrice: ${settings.account_price} TK\n\nClick the button below to buy and reveal details.`;
    const kb = Markup.inlineKeyboard([
        Markup.button.callback('🔍 Reveal Details', 'reveal_details')
    ]);
    ctx.replyWithPhoto('https://mms.businesswire.com/media/20240205162279/en/2021326/22/Paysafe_2024_Logo.jpg', { caption: msg, ...kb });
});

bot.action('reveal_details', async (ctx) => {
    ctx.answerCbQuery();
    const user = await db.getUser(ctx.from.id);
    const settings = await db.getSettings();
    const price = parseFloat(settings.account_price);

    if (parseFloat(user.balance) < price) {
        return ctx.reply(`❌ Insufficient balance! You need ${price} TK to buy an account. Your balance is ${user.balance} TK. Please Deposit.`).then(msg => setTimeout(() => ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(() => {}), 5000));
    }

    const account = await db.getAvailableAccount();
    if (!account) {
        return ctx.reply('❌ Sorry, no accounts are currently available in stock. Please try again later.').then(msg => setTimeout(() => ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(() => {}), 5000));
    }

    // Deduct balance and assign account
    await db.updateUserBalance(ctx.from.id, user.balance - price);
    await db.markAccountAsSold(account.id, ctx.from.id);

    const successMsg = `🎉 **Account Purchased Successfully!**\n\n📧 Email: \`${account.email}\`\n🔑 Password: \`${account.password}\`\n\n📌 **Instructions:** Please connect to a UK VPN, create a new UK payment profile, and then create your Paysafe account.`;
    
    ctx.replyWithAnimation('https://media.giphy.com/media/xT0xezQGU5xCDJuCPe/giphy.gif', {
        caption: successMsg,
        parse_mode: 'Markdown'
    }).catch(() => {
        ctx.reply(successMsg, { parse_mode: 'Markdown' });
    });
});

// Deposit Flow
bot.hears('💰 Deposit', (ctx) => {
    const kb = Markup.inlineKeyboard([
        [Markup.button.callback('bKash', 'dep_bkash'), Markup.button.callback('Nagad', 'dep_nagad')]
    ]);
    return ctx.reply('Select your payment method:', kb);
});

bot.on('text', async (ctx, next) => {
    // If message is from channel, ignore here (handled in channel_post)
    if (ctx.chat.type !== 'private') return next();

    const state = ctx.session?.state;
    
    if (state === 'DEPOSIT_TRXID') {
        const trxId = ctx.message.text.trim();
        
        // Allow user to cancel by clicking a menu button or sending a command
        if (trxId === '💰 Deposit' || trxId === '💳 Paysafe' || trxId === '👤 Profile' || trxId === '🎁 Refer' || trxId === '❓ Help' || trxId.startsWith('/')) {
            ctx.session.state = null;
            ctx.session.depositMethod = null;
            return next();
        }

        const method = ctx.session.depositMethod || 'unknown';
        const channelTx = await db.getChannelTransaction(trxId);
        
        if (channelTx) {
            ctx.session.state = null;
            ctx.session.depositMethod = null;
            
            if (channelTx.is_used) {
                return ctx.reply('❌ This Transaction ID has already been used by someone!').then(msg => setTimeout(() => ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(() => {}), 5000));
            }
            
            // Mark as used
            await db.markChannelTransactionAsUsed(trxId);
            
            // Save to main transactions table
            await db.saveTransaction(trxId, channelTx.amount, ctx.from.id, method);
            await db.verifyTransaction(trxId);
            await db.updateUserBalance(ctx.from.id, channelTx.amount);
            
            // Handle Referral Bonus
            const user = await db.getUser(ctx.from.id);
            if (user && user.referred_by && !user.has_deposited) {
                const referrer = await db.getUser(user.referred_by);
                if (referrer) {
                    const settings = await db.getSettings();
                    const totalRefs = referrer.total_referrals;
                    
                    let bonus = 0;
                    if (totalRefs < 10) {
                        bonus = parseFloat(channelTx.amount) * (parseFloat(settings.referral_percentage) / 100);
                    } else {
                        bonus = parseFloat(settings.referral_fixed_bonus);
                    }
                    
                    if (bonus > 0) {
                        await db.updateUserBalance(referrer.telegram_id, bonus);
                        try {
                            await ctx.telegram.sendMessage(referrer.telegram_id, `🎁 You received a referral bonus of ${bonus.toFixed(2)} TK from a new user's deposit!`);
                        } catch(e) {}
                    }
                    
                    // Update referrer ref count
                    const { supabase } = require('./db');
                    await supabase.from('users').update({ total_referrals: totalRefs + 1 }).eq('telegram_id', referrer.telegram_id);
                }
                
                // Mark user as deposited
                const { supabase } = require('./db');
                await supabase.from('users').update({ has_deposited: true }).eq('telegram_id', ctx.from.id);
            }
            
            return ctx.reply(`✅ Your deposit of ${channelTx.amount} TK (TrxID: ${trxId}) has been verified and added to your balance!`);
        } else {
            return ctx.reply('⏳ **Transaction not found in our system yet.**\n\n📌 *Make sure you are ONLY sending the TrxID (e.g. 9A2B3C4D5E).*\n\nIf you just sent money, please wait 1-2 minutes and send the TrxID again.', { parse_mode: 'Markdown' });
        }
    }
    
    return next();
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
    const amtMatch = text.match(/(?:Tk|BDT|Amount|৳)\s*[:.-]?\s*([\d,]+(?:\.\d+)?)/i);
    
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
