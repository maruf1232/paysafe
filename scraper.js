const puppeteer = require('puppeteer');

async function scrapeOTP(url) {
    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: "new", 
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        const page = await browser.newPage();
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Poll every 5 seconds for up to 2 minutes (24 times)
        for (let i = 0; i < 24; i++) {
            await new Promise(r => setTimeout(r, 5000));
            // reload page to get new messages
            await page.reload({ waitUntil: 'networkidle2' }).catch(() => {});
            
            const text = await page.evaluate(() => {
                const elements = document.querySelectorAll('td, div, p, span');
                for (let el of elements) {
                    const t = el.innerText.trim();
                    if (t.toLowerCase().includes('paysafe')) {
                        return t;
                    }
                }
                return null;
            });
            
            if (text) {
                return text;
            }
        }
        
        return null;
    } catch (e) {
        console.error('Scraping error:', e.message);
        return null;
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = { scrapeOTP };
