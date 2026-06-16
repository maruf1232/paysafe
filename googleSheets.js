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

module.exports = {
    logFailedAccount,
    getAvailableAccount,
    markAccountUsed,
    countAvailableStock
};
