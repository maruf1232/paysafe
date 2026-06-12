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
        ['👤 Profile', '🎁 Refer'],
        ['❓ Help', '💳 Paysafe', '💰 Deposit']
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
        return ctx.reply(`❌ Insufficient balance! You need ${price} TK to buy an account. Your balance is ${user.balance} TK. Please Deposit.`);
    }

    const account = await db.getAvailableAccount();
    if (!account) {
        return ctx.reply('❌ Sorry, no accounts are currently available in stock. Please try again later.');
    }

    // Deduct balance and assign account
    await db.updateUserBalance(ctx.from.id, -price);
    await db.markAccountAsSold(account.id, ctx.from.id);

    const msg = `✅ **Account Purchase Successful!**\n\n📧 Email: \`${account.email}\`\n🔑 Password: \`${account.password}\`\n\n**Instructions:**\n1. Connect a UK VPN.\n2. Create a new UK payment profile.\n3. Create your Paysafe account using these details.`;
    ctx.reply(msg, { parse_mode: 'Markdown' });
});

// Deposit Flow
bot.hears('💰 Deposit', (ctx) => {
    ctx.session.state = 'DEPOSIT_AMOUNT';
    ctx.reply('Enter the amount you want to deposit (in TK):');
});

bot.on('text', async (ctx, next) => {
    // If message is from channel, ignore here (handled in channel_post)
    if (ctx.chat.type !== 'private') return next();

    const state = ctx.session?.state;
    
    if (state === 'DEPOSIT_AMOUNT') {
        const amount = parseFloat(ctx.message.text);
        if (isNaN(amount) || amount <= 0) {
            return ctx.reply('Please enter a valid amount.');
        }
        ctx.session.depositAmount = amount;
        ctx.session.state = null;
        
        const kb = Markup.inlineKeyboard([
            [Markup.button.callback('bKash', 'dep_bkash'), Markup.button.callback('Nagad', 'dep_nagad')]
        ]);
        return ctx.reply('Select your payment method:', kb);
    }
    
    if (state === 'DEPOSIT_TRXID') {
        const trxId = ctx.message.text.trim();
        const amount = ctx.session.depositAmount;
        const method = ctx.session.depositMethod;
        
        ctx.session.state = null;
        ctx.session.depositAmount = null;
        ctx.session.depositMethod = null;
        
        // Save as pending transaction
        const { data, error } = await db.saveTransaction(trxId, amount, ctx.from.id, method);
        
        if (error) {
            if (error.code === '23505' || (error.message && error.message.includes('unique'))) {
                return ctx.reply('❌ This Transaction ID has already been used by someone!', { parse_mode: 'Markdown' });
            }
            return ctx.reply('❌ An error occurred while processing your transaction. Please try again.');
        }

        ctx.reply(`⏳ Your TrxID \`${trxId}\` for ${amount} TK has been recorded. It will be automatically verified shortly.`, { parse_mode: 'Markdown' });
        
        // Immediately try to verify in case the channel message already arrived
        await verifyAndProcessTransaction(trxId, ctx.telegram);
        return;
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
    if (ctx.chat.id.toString() !== ADMIN_CHANNEL_ID) return;
    
    const text = ctx.channelPost.text || '';
    
    // Very basic TrxID extraction. It assumes an 8-10 alphanumeric string.
    // E.g. "TrxID 9A2B3C4D5E" or similar
    const match = text.match(/\b([A-Z0-9]{8,10})\b/g);
    if (match && match.length > 0) {
        for (let trxId of match) {
            // Check if there is any pending transaction with this TrxID
            await verifyAndProcessTransaction(trxId, ctx.telegram);
        }
    }
});

async function verifyAndProcessTransaction(trxId, telegramApp) {
    const pendingTx = await db.getPendingTransaction(trxId);
    if (pendingTx) {
        await db.verifyTransaction(trxId);
        await db.updateUserBalance(pendingTx.user_id, pendingTx.amount);
        
        try {
            await telegramApp.sendMessage(pendingTx.user_id, `✅ Your deposit of ${pendingTx.amount} TK (TrxID: ${trxId}) has been verified and added to your balance!`);
        } catch(e) { console.log('Could not message user', e); }

        // Process referral logic
        const user = await db.getUser(pendingTx.user_id);
        if (user && user.referred_by && !user.has_deposited) {
            const referrer = await db.getUser(user.referred_by);
            if (referrer) {
                const settings = await db.getSettings();
                const totalRefs = referrer.total_referrals;
                
                let bonus = 0;
                if (totalRefs < 10) {
                    bonus = parseFloat(pendingTx.amount) * (parseFloat(settings.referral_percentage) / 100);
                } else {
                    bonus = parseFloat(settings.referral_fixed_bonus);
                }
                
                if (bonus > 0) {
                    await db.updateUserBalance(referrer.telegram_id, bonus);
                    try {
                        await telegramApp.sendMessage(referrer.telegram_id, `🎉 You received a referral bonus of ${bonus.toFixed(2)} TK from a new user's deposit!`);
                    } catch(e) {}
                }
                
                // Update referrer ref count
                const { supabase } = require('./db');
                await supabase.from('users').update({ total_referrals: totalRefs + 1 }).eq('telegram_id', referrer.telegram_id);
            }
            
            // Mark user as deposited
            const { supabase } = require('./db');
            await supabase.from('users').update({ has_deposited: true }).eq('telegram_id', pendingTx.user_id);
        }
    }
}

// Attach a method to broadcast
process.sendBroadcast = async (message) => {
    const { supabase } = require('./db');
    const { data: users } = await supabase.from('users').select('telegram_id');
    if (users) {
        let count = 0;
        for (let u of users) {
            try {
                await bot.telegram.sendMessage(u.telegram_id, `📢 **Broadcast Message**\n\n${message}`, { parse_mode: 'Markdown' });
                count++;
            } catch (e) {
                // User might have blocked the bot
            }
            // Add slight delay to avoid rate limit
            await new Promise(r => setTimeout(r, 50));
        }
        console.log(`Broadcast completed to ${count} users.`);
    }
};

module.exports = bot;
