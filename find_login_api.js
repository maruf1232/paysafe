const puppeteer = require('puppeteer');

async function interceptLogin() {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    
    // Intercept requests
    await page.setRequestInterception(true);
    page.on('request', request => {
        if (request.method() === 'POST') {
            console.log("POST REQUEST TO:", request.url());
            console.log("POST DATA:", request.postData());
        }
        request.continue();
    });

    try {
        await page.goto('https://quackr.io/temporary-numbers/united-kingdom/447480778003', { waitUntil: 'networkidle2' });
        
        console.log("Page title:", await page.title());
        console.log("Page content:", (await page.content()).substring(0, 500));
        
        // Wait for 'Sign In' button and click it
        console.log("Waiting for Sign In button...");
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('a, button'));
            const btn = btns.find(b => b.innerText && b.innerText.includes('Sign In'));
            if (btn) btn.click();
            else console.log("Sign In button not found.");
        });
        
        console.log("Waiting for 5 seconds to observe...");
        await new Promise(r => setTimeout(r, 5000));
        
    } catch (e) {
        console.error("Error:", e.message);
    } finally {
        await browser.close();
    }
}
interceptLogin();
