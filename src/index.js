const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const LAST_PLAY_DATE_FILE = 'last_play_date.txt';

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

        // --- Check Last Play Date ---
        console.log("Checking Last Play Date...");
        
        // Extract Last Play Date from the page
        const lastPlayDate = await page.evaluate(() => {
             // Look for the element with text "最終プレー日時" and get its sibling/value
             // Based on sample: <div class="profile_col">最終プレー日時</div> <div class="profile_cnt">2026/02/09 21:09:41</div>
             const labels = Array.from(document.querySelectorAll('.profile_col'));
             const label = labels.find(el => el.textContent.includes('最終プレー日時'));
             if (label && label.nextElementSibling) {
                 return label.nextElementSibling.textContent.trim();
             }
             return null;
        });

        if (!lastPlayDate) {
            console.warn("Warning: Could not find Last Play Date on profile page. Proceeding with update anyway.");
        } else {
            console.log(`Current Last Play Date: ${lastPlayDate}`);
            
            // Read stored last play date
            let storedLastPlayDate = '';
            try {
                if (fs.existsSync(LAST_PLAY_DATE_FILE)) {
                    storedLastPlayDate = fs.readFileSync(LAST_PLAY_DATE_FILE, 'utf8').trim();
                    console.log(`Stored Last Play Date: ${storedLastPlayDate}`);
                }
            } catch (err) {
                console.log("No stored last play date found or read error.");
            }

            if (lastPlayDate === storedLastPlayDate) {
                console.log("Last Play Date matches. No new play data. Skipping update.");
                process.exit(0);
            }
        }
        
        console.log("New play data detected (or first run). Proceeding with update...");

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

        // Find the register button.
        console.log("Attempting to click register button...");
        
        const clicked = await page.evaluate(async () => {
             // 1. Try User provided XPath: //*[@id="contents"]/div/form/input[3]
            try {
                const xpath = '//*[@id="contents"]/div/form/input[3]';
                const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                const button = result.singleNodeValue;
                if (button) {
                    button.click();
                    return "XPath";
                }
            } catch (e) { console.error("XPath attempt failed", e); }

            // 2. Fallback: Search for any button/input with "登録する"
            const buttons = document.querySelectorAll('button, input[type="submit"], input[type="button"]');
            for (const btn of buttons) {
                if ((btn.value && btn.value.includes('登録する')) || 
                    (btn.textContent && btn.textContent.includes('登録する'))) {
                    btn.click();
                    return "TextSearch";
                }
            }
            return false;
        });

        if (clicked) {
            console.log(`Clicked 'Register' using strategy: ${clicked}. Update complete!`);
            
            // Update the stored Last Play Date only if update was successful
            if (lastPlayDate) {
                fs.writeFileSync(LAST_PLAY_DATE_FILE, lastPlayDate, 'utf8');
                console.log(`Updated stored Last Play Date to: ${lastPlayDate}`);
            }

            await new Promise(r => setTimeout(r, 2000));
        } else {
            console.log("Could not find register button. Dumping page structure for debug...");
            // Simple dump of body text to see what's on the page
            const bodyText = await page.evaluate(() => document.body.innerText); 
            console.log("Page Text Content (First 500 chars):", bodyText.substring(0, 500));
            
            throw new Error("Register button not found on Vaddict page.");
        }

    } catch (err) {
        console.error("Fatal Error:", err);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
