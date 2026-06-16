const fs = require('fs');

let code = fs.readFileSync('mainBot.js', 'utf8');

// Replace otpSessions.set and the inline keyboard in buy_qty handler
code = code.replace(
    /otpSessions\.set\(ctx\.from\.id, \{ account, attempts: 0 \}\);[\s\S]*?const kb = Markup\.inlineKeyboard\(\[\s*\[Markup\.button\.callback\('📩 Get OTP', 'get_otp'\)\]\s*\]\);/,
    `otpSessions.set(ctx.from.id, { account, replaced: false });

        const msg = \`✅ <b>Purchase Successful!</b>\\n\\n\` +
                    \`<blockquote>📧 <b>Email:</b> <code>\${account.email}</code>\\n\` +
                    \`🔑 <b>Password:</b> <tg-spoiler>\${account.password}</tg-spoiler>\\n\` +
                    \`📱 <b>Phone No:</b> <code>\${account.phoneNo}</code></blockquote>\\n\\n\` +
                    \`⚠️ <i>These accounts are temporary and strictly for Google free trials. DO NOT add money!</i>\`;
        
        const kb = Markup.inlineKeyboard([
            [Markup.button.url('🔗 OTP Link', account.otpLink)],
            [Markup.button.callback('❌ Didn\\'t get OTP', 'replace_account')]
        ]);`
);

// Delete the get_otp block and replace with replace_account
const getOtpBlockRegex = /const scraper = require\('\.\/scraper'\);\s*bot\.action\('get_otp'[\s\S]*?bot\.action\('dep_bkash'/;

const replaceAccountCode = `bot.action('replace_account', async (ctx) => {
    try {
        const session = otpSessions.get(ctx.from.id);
        if (!session) {
            return ctx.answerCbQuery('❌ Session expired. Please buy a new account.', { show_alert: true });
        }
        
        if (session.replaced) {
            return ctx.answerCbQuery('❌ You have already replaced your account once. Please contact admin if you still have issues.', { show_alert: true });
        }

        await ctx.answerCbQuery('🔄 Replacing account...', { show_alert: false }).catch(()=>{});
        
        const sheets = require('./googleSheets');
        
        // Log the failed account to Sheet 2
        await sheets.logFailedAccount(session.account);
        
        const newAccount = await sheets.getAvailableAccount();
        if (!newAccount) {
            return ctx.reply('❌ Sorry, out of stock for replacement! Admin notified.');
        }
        
        await sheets.markAccountUsed(newAccount.row);
        otpSessions.set(ctx.from.id, { account: newAccount, replaced: true });
        
        const newMsg = \`✅ <b>Replacement Successful!</b>\\n\\n\` +
                       \`<blockquote>📧 <b>Email:</b> <code>\${newAccount.email}</code>\\n\` +
                       \`🔑 <b>Password:</b> <tg-spoiler>\${newAccount.password}</tg-spoiler>\\n\` +
                       \`📱 <b>Phone No:</b> <code>\${newAccount.phoneNo}</code></blockquote>\\n\\n\` +
                       \`⚠️ <i>These accounts are temporary and strictly for Google free trials. DO NOT add money!</i>\`;
        
        const kb = Markup.inlineKeyboard([
            [Markup.button.url('🔗 OTP Link', newAccount.otpLink)]
        ]);
        
        await ctx.replyWithPhoto('https://cyrjsbfsfhcwocdqtkuv.supabase.co/storage/v1/object/public/Maruf/Paysafe%20buy%20account%20successs.png', { caption: newMsg, parse_mode: 'HTML', ...kb });
        
    } catch (e) {
        console.error(e);
        ctx.answerCbQuery('❌ An error occurred.', { show_alert: true }).catch(()=>{});
    }
});

bot.action('dep_bkash'`;

code = code.replace(getOtpBlockRegex, replaceAccountCode);

fs.writeFileSync('mainBot.js', code);
console.log('mainBot.js updated');
