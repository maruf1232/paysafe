const puppeteer = require('puppeteer');

async function scrapeOTP(url) {
    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: "new", 
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        const page = await browser.newPage();
        
        // Go to Quackr URL
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Wait up to 10 seconds for the message table to appear (sometimes requires scrolling or waiting)
        await new Promise(r => setTimeout(r, 8000)); 
        
        // Extract messages
        const text = await page.evaluate(() => {
            const elements = document.querySelectorAll('td, div, p, span');
            for (let el of elements) {
                const t = el.innerText.trim();
                // Check if the text has both "paysafe" and looks like an OTP
                if (t.toLowerCase().includes('paysafe')) {
                    // Usually an OTP message is something like "Your Paysafe verification code is 123456"
                    return t; // Return the first matching message
                }
            }
            return null;
        });
        
        return text;
    } catch (e) {
        console.error('Scraping error:', e.message);
        return null;
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = { scrapeOTP };
