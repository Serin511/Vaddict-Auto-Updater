const puppeteer = require('puppeteer');

(async () => {
    console.log("Starting Vaddict Auto Updater...");

    const M573SSID = process.env.M573SSID;
    if (!M573SSID) {
        console.error("Error: M573SSID environment variable is missing.");
        process.exit(1);
    }

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();

        // Set Cookie
        await page.setCookie({
            name: 'M573SSID',
            value: M573SSID,
            domain: '.573.jp', // More permissive domain
            path: '/',
        });

        // Navigate to SDVX Profile
        console.log("Navigating to SDVX Profile...");
        await page.goto('https://p.eagate.573.jp/game/sdvx/vii/playdata/profile/index.html', {
            waitUntil: 'domcontentloaded'
        });

        // Check for login redirect (if cookie is invalid)
        if (page.url().includes('login')) {
            throw new Error("Login failed. M573SSID cookie might be invalid or expired.");
        }

        console.log("Injecting data collection script...");

        // Start navigation wait BEFORE triggering the form submit inside evaluate
        // However, the evaluate takes a long time (fetching data).
        // So we just await evaluate, and the LAST step of evaluate is form.submit()
        // form.submit() triggers navigation.

        const navigationPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 180000 });

        await page.evaluate(async () => {
            // --- INJECTED LOGIC FROM regist_nabla.js (Modified) ---
            const BASE_URL = "https://p.eagate.573.jp/game/sdvx/vii/playdata/";
            const INDEX_PATH = "index.html";
            const PLAYER_PATH = "profile/index.html";
            const MUSIC_PATH = "musicdata/index.html";
            const SEND_TO = "https://vaddict.b35.jp/regist_nabla.php";
            const LIMIT = 150;

            const data = {
                profile: "",
                musicdata_list: []
            };

            const _sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min) + min);

            const fetchHTML = async (url, referer_url) => {
                const response = await fetch(url, { cache: "no-store", referrer: referer_url, credentials: "include" });
                if (!response.ok) {
                    throw new Error(`Network response was not ok: ${response.statusText}`);
                }
                return response.text();
            };

            const getMusicData = async (page) => {
                const url = `${BASE_URL}${MUSIC_PATH}?limit=${LIMIT}&sort=0&page=${page}`;
                return fetchHTML(url, BASE_URL + MUSIC_PATH + "?limit=" + LIMIT + "page=1&sort=0");
            };

            const createAndSubmitForm = (data) => {
                const form = document.createElement('form');
                form.method = 'POST';
                form.action = SEND_TO;
                form.style.display = 'none';

                for (const key in data) {
                    if (data.hasOwnProperty(key)) {
                        const textarea = document.createElement('textarea');
                        textarea.name = key;
                        textarea.value = Array.isArray(data[key]) ? data[key].join("\n") : data[key];
                        form.appendChild(textarea);
                    }
                }

                document.body.appendChild(form);
                form.submit();
            };

            // Main Execution Logic
            try {
                // 1. Fetch Profile
                console.log("Fetching Profile...");
                data.profile = await fetchHTML(BASE_URL + PLAYER_PATH, BASE_URL + INDEX_PATH);

                // 2. Fetch Music Index to determine pages
                console.log("Fetching Music Index...");
                const music_index = await fetchHTML(BASE_URL + MUSIC_PATH + "?limit=" + LIMIT, BASE_URL + MUSIC_PATH + "?limit=" + LIMIT + "page=1&sort=0");

                if (music_index.indexOf('このサービスはe-amusement ベーシックコースの加入が必要です｡') != -1) {
                    throw new Error("Basic Course subscription required.");
                }

                const matches = music_index.match(/<span class="page_num">[0-9]{1,3}/g);
                let maxPage = 1;
                if (matches) {
                    const music_page_list_temp = matches.map(match => match.replace('<span class="page_num">', ''));
                    maxPage = Number(music_page_list_temp.slice(-1)[0]) + 1;
                } else {
                    maxPage = 2; // Default to at least 1 page iteration
                }

                // 3. Fetch all pages
                for (let k = 1; k < maxPage; k++) {
                    console.log(`Fetching Music Data page ${k}/${maxPage - 1}...`);
                    const dataPage = await getMusicData(k);
                    data.musicdata_list.push(dataPage);
                    // Reduced sleep time slightly for bot efficiency, but kept to avoid rate limiting
                    await _sleep(getRandomInt(500, 1000));
                }

                // 4. Submit
                console.log("Submitting data to Vaddict...");
                createAndSubmitForm(data);

            } catch (error) {
                console.error("In-browser error:", error);
                // Propagate error to Puppeteer context if possible, or handle it
                throw error;
            }
        });

        console.log("Data submitted, waiting for Vaddict response...");
        await navigationPromise;

        // Now we should be on vaddict.b35.jp
        if (!page.url().includes('vaddict.b35.jp')) {
            throw new Error(`Unexpected URL after submission: ${page.url()}`);
        }

        console.log("Landed on Vaddict. Looking for register button...");
        
        // Find the register button. Usually it's an input type=submit.
        // We look for the button with value="登録する" or text "登録する"
        const registerButtonSelector = 'input[value="登録する"]';
        
        try {
            await page.waitForSelector(registerButtonSelector, { timeout: 5000 });
            await page.click(registerButtonSelector);
            console.log("Clicked 'Register'. Update complete!");
            
            // Wait a bit to ensure request sends
            await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
            console.log("Could not find standard register button, dumping page content for debug...");
            // Fallback: try finding by text
             const [button] = await page.$x("//button[contains(., '登録する')] | //input[@value='登録する']");
             if (button) {
                 await button.click();
                 console.log("Clicked 'Register' (via XPath). Update complete!");
                 await new Promise(r => setTimeout(r, 2000));
             } else {
                 throw new Error("Register button not found on Vaddict page.");
             }
        }

    } catch (err) {
        console.error("Fatal Error:", err);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
