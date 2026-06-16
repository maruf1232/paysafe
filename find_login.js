const axios = require('axios');
const cheerio = require('cheerio');

async function getLoginUrl() {
    try {
        const { data } = await axios.get('https://quackr.io/temporary-numbers/united-kingdom/447480778003');
        const $ = cheerio.load(data);
        console.log("Login link:", $('a').filter((i, el) => $(el).text().toLowerCase().includes('sign in') || $(el).text().toLowerCase().includes('log')).attr('href'));
    } catch (e) {
        console.error("Error:", e.message);
    }
}
getLoginUrl();
