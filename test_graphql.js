const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function interceptGraphQL() {
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
        const page = await browser.newPage();
        
        // Intercept requests
        await page.setRequestInterception(true);
        page.on('request', request => {
            if (request.url().includes('graphql')) {
                console.log("GRAPHQL REQUEST TO:", request.url());
                console.log("POST DATA:", request.postData());
            }
            request.continue();
        });

        console.log("Going to number page...");
        await page.goto('https://quackr.io/temporary-numbers/united-kingdom/447480778003', { waitUntil: 'networkidle2' });
        
        await new Promise(r => setTimeout(r, 5000));
        
    } catch (e) {
        console.error("Error:", e.message);
    } finally {
        await browser.close();
    }
}
interceptGraphQL();
