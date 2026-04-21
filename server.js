require('dotenv').config();
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const axios = require('axios');

async function scrapeBichoCerto(nome, url) {
    console.log(`--- Iniciando ${nome} ---`);
    let browser;
    try {
        browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        const html = await page.content();
        await browser.close();

        const $ = cheerio.load(html);
        const results = [];
        const dataHoje = new Date().toISOString().split('T')[0];

        // Seletor mais genérico para pegar as linhas
        const rows = $('table tbody tr, .result-group-item');
        console.log(`Linhas encontradas para ${nome}: ${rows.length}`);

        rows.each((i, row) => {
            if (i >= 7) return; 
            const tds = $(row).find('td, div');
            let milhar = "", grupo = "";

            tds.each((idx, el) => {
                const txt = $(el).text().trim().replace('.', '');
                if (txt.length >= 3 && txt.length <= 4 && !isNaN(txt)) milhar = txt.padStart(4, '0');
                else if (txt.length <= 2 && !isNaN(txt)) grupo = txt;
            });

            if (milhar !== "" && grupo !== "") {
                results.push({ loteria: nome, milhar, grupo, data: dataHoje });
            }
        });
        return results;
    } catch (e) {
        console.error(`Erro no ${nome}: ${e.message}`);
        if (browser) await browser.close();
        return [];
    }
}

async function rodar() {
    const urls = [
        { nome: 'LOOK', url: 'https://bichocerto.com/resultados/lk/look/' }
    ]; // Adicione as outras depois
    
    let todos = [];
    for (const l of urls) {
        todos.push(...await scrapeBichoCerto(l.nome, l.url));
    }

    if (todos.length > 0) {
        console.log("Dados encontrados:", JSON.stringify(todos, null, 2));
        
        try {
            const WEBHOOK = 'https://hook.us2.make.com/ee4umw7oa8p4hwgob4kqlpvqxy7bxdh4';
            const response = await axios.post(WEBHOOK, todos);
            console.log("Envio para o Make realizado! Status:", response.status);
        } catch (error) {
            console.error("Erro ao enviar para o Webhook:", error.message);
        }
    } else {
        console.log("Nenhum dado encontrado para enviar.");
    }
}
rodar();
