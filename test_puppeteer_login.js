const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function testLogin() {
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
        const page = await browser.newPage();
        
        console.log("Going to Quackr login...");
        await page.goto('https://quackr.io/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // Wait for email field
        console.log("Waiting for email field...");
        await page.waitForSelector('input[name="email"]', { timeout: 30000 });
        
        console.log("Typing credentials...");
        await page.type('input[name="email"]', 'kevzona@hetzez.com');
        await page.type('input[name="password"]', 'Maruf1232#+');
        
        console.log("Clicking login...");
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => console.log('Navigation wait timeout, but proceeding')),
            page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Log In') || b.innerText.includes('Sign In'));
                if (btn) btn.click();
                else document.querySelector('form').submit();
            })
        ]);
        
        console.log("Checking if logged in...");
        const url = page.url();
        console.log("Current URL:", url);
        
        // Now try to go to the temporary number page
        console.log("Going to number page...");
        await page.goto('https://quackr.io/temporary-numbers/united-kingdom/447480778003', { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // Wait a few seconds for the content to render
        await new Promise(r => setTimeout(r, 5000));
        
        const content = await page.evaluate(() => {
            return document.body.innerText;
        });
        
        if (content.includes('Paysafe') || content.includes('PAYSAFE')) {
            console.log("SUCCESS! Found Paysafe messages.");
            const idx = content.toLowerCase().indexOf('paysafe');
            console.log(content.substring(Math.max(0, idx - 50), idx + 100));
        } else {
            console.log("FAILED! Could not find messages. Content snippet:");
            console.log(content.substring(0, 500));
        }
        
    } catch (e) {
        console.error("Error:", e.message);
    } finally {
        await browser.close();
    }
}

testLogin();
