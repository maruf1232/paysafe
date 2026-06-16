const axios = require('axios');
const cheerio = require('cheerio');

async function testLogin() {
    try {
        const loginUrl = 'https://quackr.io/login';
        
        // 1. Get the login page to extract CSRF token (if any)
        const response1 = await axios.get(loginUrl);
        const $ = cheerio.load(response1.data);
        
        const csrfToken = $('input[name="_token"]').val();
        console.log("CSRF Token:", csrfToken);
        
        // Setup cookies
        const cookies = response1.headers['set-cookie'];
        
        // 2. Submit login form
        const params = new URLSearchParams();
        if (csrfToken) params.append('_token', csrfToken);
        params.append('email', 'kevzona@hetzez.com');
        params.append('password', 'Maruf1232#+');
        
        const loginPost = await axios.post(loginUrl, params.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': cookies ? cookies.join('; ') : '',
                'User-Agent': 'Mozilla/5.0'
            },
            maxRedirects: 0,
            validateStatus: status => status >= 200 && status < 400
        });
        
        console.log("Login Post Status:", loginPost.status);
        console.log("Login Post Headers:", loginPost.headers);
        
        const sessionCookies = loginPost.headers['set-cookie'] || cookies;
        console.log("Session Cookies:", sessionCookies);
        
        // 3. Try to access the number page
        const numUrl = 'https://quackr.io/temporary-numbers/united-kingdom/447781486438';
        const pageRes = await axios.get(numUrl, {
            headers: {
                'Cookie': sessionCookies ? sessionCookies.map(c => c.split(';')[0]).join('; ') : '',
                'User-Agent': 'Mozilla/5.0'
            }
        });
        
        const $page = cheerio.load(pageRes.data);
        const elements = $page('td, div, p, span, li');
        let textFound = null;
        elements.each((_, el) => {
            const t = $page(el).text().trim();
            if (t.toLowerCase().includes('paysafe')) {
                textFound = t;
                return false;
            }
        });
        
        console.log("Found paysafe msg:", textFound);
        
    } catch (e) {
        console.error("Error:", e.message);
    }
}
testLogin();
