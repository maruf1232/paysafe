const fs = require('fs');

let code = fs.readFileSync('googleSheets.js', 'utf8');

const newCode = `
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
`;

if (!code.includes('logFailedAccount')) {
    code = code.replace(/module\.exports = \{/g, newCode + '\nmodule.exports = {\n    logFailedAccount,');
    fs.writeFileSync('googleSheets.js', code);
    console.log('googleSheets.js updated');
} else {
    console.log('logFailedAccount already exists');
}
