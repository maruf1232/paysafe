const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const creds = require('./paysafebot-c28d9f763f51.json');

const SPREADSHEET_ID = '1WchJznP1SSc0zxB90CJOoAbB4zbV8BV_KxLSrDdpyvo';

const serviceAccountAuth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);

let isInitialized = false;

async function init() {
    if (isInitialized) return;
    await doc.loadInfo();
    isInitialized = true;
    console.log(`Connected to Google Sheet: ${doc.title}`);
}

async function getAvailableAccount() {
    await init();
    const sheet = doc.sheetsByIndex[0]; // Assuming first tab
    const rows = await sheet.getRows();
    
    // Find first row where Status (column F) is not TRUE/checked
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.get('Status') !== 'TRUE' && row.get('Status') !== 'true' && row.get('Status') !== 'TRUE') { // Checkbox true
            return {
                row: row,
                accountNo: row.get('Account NO'),
                email: row.get('Email'),
                password: row.get('Password'),
                phoneNo: row.get('Phone NO'),
                otpLink: row.get('OTP Link')
            };
        }
    }
    return null; // Out of stock
}

async function markAccountUsed(row) {
    row.set('Status', 'TRUE');
    await row.save();
}

async function countAvailableStock() {
    await init();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    let count = 0;
    for (let i = 0; i < rows.length; i++) {
        const status = rows[i].get('Status');
        if (status !== 'TRUE' && status !== 'true') {
            count++;
        }
    }
    return count;
}


async function logFailedAccount(accountDetails) {
    await init();
    let sheet;
    try {
        sheet = doc.sheetsByIndex[1];
        if (!sheet) {
            sheet = await doc.addSheet({ headerValues: ['Account NO', 'Email', 'Password', 'Phone NO', 'OTP Link'], title: 'Sheet2' });
        }
    } catch (e) {
        // Fallback if sheet creation fails
        console.error('Error getting/creating Sheet 2:', e);
        return;
    }
    
    await sheet.addRow({
        'Account NO': accountDetails.accountNo || '',
        'Email': accountDetails.email || '',
        'Password': accountDetails.password || '',
        'Phone NO': accountDetails.phoneNo || '',
        'OTP Link': accountDetails.otpLink || ''
    });
}


async function findAccountByPhoneOrLink(query) {
    await init();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const phone = row.get('Phone NO') || '';
        const link = row.get('OTP Link') || '';
        
        if (phone.includes(query) || link.includes(query)) {
            return {
                row: row,
                accountNo: row.get('Account NO'),
                email: row.get('Email'),
                password: row.get('Password'),
                phoneNo: row.get('Phone NO'),
                otpLink: row.get('OTP Link')
            };
        }
    }
    return null;
}

async function logToSheet3(accountDetails, userId) {
    await init();
    let sheet;
    try {
        sheet = doc.sheetsByTitle['Sheet3'];
        if (!sheet) {
            sheet = doc.sheetsByIndex[2];
        }
    } catch (e) {
        console.error('Error getting/creating Sheet 3:', e);
        return;
    }
    
    if (!sheet) return;

    const rows = await sheet.getRows();
    let targetRow = null;
    
    for (let i = 0; i < rows.length; i++) {
        if (!rows[i].get('Account No')) {
            targetRow = rows[i];
            break;
        }
    }
    
    if (targetRow) {
        targetRow.set('Account No', accountDetails.accountNo || '');
        targetRow.set('Telegram User ID', userId || '');
        targetRow.set('Email', accountDetails.email || '');
        targetRow.set('Password', accountDetails.password || '');
        targetRow.set('Phone No', accountDetails.phoneNo || '');
        targetRow.set('OTP Link', accountDetails.otpLink || '');
        await targetRow.save();
    } else {
        await sheet.addRow({
            'Account No': accountDetails.accountNo || '',
            'Telegram User ID': userId || '',
            'Email': accountDetails.email || '',
            'Password': accountDetails.password || '',
            'Phone No': accountDetails.phoneNo || '',
            'OTP Link': accountDetails.otpLink || '',
            'OTP success': 'FALSE',
            'OTP Failed': 'FALSE'
        });
    }
}

async function verifyOTPReports(bot) {
    await init();
    let sheet = doc.sheetsByIndex[2];
    if (!sheet) return "No Sheet 3 found.";
    
    const rows = await sheet.getRows();
    if (rows.length === 0) return "✅ No pending reports in Sheet 3.";
    
    let processed = 0;
    const rowsToDelete = [];
    
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const success = (row.get('OTP success') || '').toUpperCase();
        const failed = (row.get('OTP Failed') || '').toUpperCase();
        const userId = row.get('Telegram User ID');
        
        const isSuccessChecked = success === 'TRUE' || success === 'YES';
        const isFailedChecked = failed === 'TRUE' || failed === 'YES';
        
        if (isSuccessChecked && userId) {
            try {
                await bot.telegram.sendMessage(userId, "✅ <b>OTP Verified!</b>\n\nWe checked your report and the OTP has successfully arrived. Please check the link again.", { parse_mode: 'HTML' });
            } catch(e) {}
            rowsToDelete.push(row);
            processed++;
        } else if (isFailedChecked && userId) {
            // Need to give a new account
            const newAccount = await getAvailableAccount();
            if (newAccount) {
                await markAccountUsed(newAccount.row);
                const msg = `✅ <b>Replacement Successful!</b>\n\n` +
                            `<blockquote>📧 <b>Email:</b> \n<code>${newAccount.email}</code>\n\n` +
                            `🔑 <b>Password:</b> \n<tg-spoiler>${newAccount.password}</tg-spoiler>\n\n` +
                            `📱 <b>Phone No:</b> \n<code>${newAccount.phoneNo}</code></blockquote>\n\n` +
                            `⚠️ <i>These accounts are temporary and strictly for Google free trials. DO NOT add money!</i>`;
                
                const { Markup } = require('telegraf');
                const kb = Markup.inlineKeyboard([
                    [Markup.button.url('🔗 OTP Link', newAccount.otpLink)]
                ]);
                
                try {
                    await bot.telegram.sendPhoto(userId, 'https://cyrjsbfsfhcwocdqtkuv.supabase.co/storage/v1/object/public/Maruf/Paysafe%20buy%20account%20successs.png', { caption: msg, parse_mode: 'HTML', ...kb });
                } catch(e) {}
            } else {
                try {
                    await bot.telegram.sendMessage(userId, "❌ Your report was approved, but we are currently out of stock for replacements. Admin has been notified.");
                } catch(e) {}
            }
            rowsToDelete.push(row);
            processed++;
        }
    }
    
    // Delete from bottom to top to avoid index shifting
    for (let i = rowsToDelete.length - 1; i >= 0; i--) {
        await rowsToDelete[i].delete();
    }
    
    return `✅ Verification complete! Processed ${processed} reports.`;
}

module.exports = {
    findAccountByPhoneOrLink,
    logToSheet3,
    verifyOTPReports,
    logFailedAccount,
    getAvailableAccount,
    markAccountUsed,
    countAvailableStock
};
