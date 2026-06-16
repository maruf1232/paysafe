const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    try {
        const { data } = await axios.get('https://quackr.io/temporary-numbers/united-kingdom/447781486438', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        });
        const $ = cheerio.load(data);
        console.log("Page title:", $('title').text());
        console.log("Checking for paysafe messages...");
        const elements = $('td, div, p, span');
        let found = false;
        elements.each((i, el) => {
            const text = $(el).text();
            if (text.toLowerCase().includes('paysafe')) {
                console.log("Found:", text.trim());
                found = true;
            }
        });
        if (!found) console.log("No Paysafe message found currently.");
    } catch (e) {
        console.error("Error:", e.message);
    }
}
test();
