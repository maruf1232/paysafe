const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeOTP(url) {
    try {
        // Poll every 5 seconds for up to 2 minutes (24 times)
        for (let i = 0; i < 24; i++) {
            try {
                const { data } = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    },
                    timeout: 10000
                });
                
                const $ = cheerio.load(data);
                const elements = $('td, div, p, span, li');
                
                let textFound = null;
                elements.each((_, el) => {
                    const t = $(el).text().trim();
                    if (t.toLowerCase().includes('paysafe')) {
                        textFound = t;
                        return false; // Break the cheerio loop
                    }
                });
                
                if (textFound) {
                    return textFound;
                }
            } catch (err) {
                console.error("Fetch error on try", i, err.message);
                // Continue polling even if one request fails
            }
            
            // Wait 5 seconds before next poll
            await new Promise(r => setTimeout(r, 5000));
        }
        
        return null;
    } catch (e) {
        console.error('Scraping error:', e.message);
        return null;
    }
}

module.exports = { scrapeOTP };
