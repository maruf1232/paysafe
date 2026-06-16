const cloudscraper = require('cloudscraper');

async function testCloudScraper() {
    try {
        console.log("Fetching quackr.io/login with cloudscraper...");
        const html = await cloudscraper.get('https://quackr.io/login');
        if (html.includes('Cloudflare') || html.includes('challenge')) {
            console.log("Cloudflare challenge hit!");
        } else {
            console.log("Success! No challenge detected.");
            console.log(html.substring(0, 300));
        }
    } catch (e) {
        console.log("Error:", e.message);
    }
}
testCloudScraper();
