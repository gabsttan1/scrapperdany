require('dotenv').config();
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const axios = require('axios');

const loteriasParaScrapear = [
    { nome: 'LOOK', url: 'https://bichocerto.com/resultados/lk/look/' },
    { nome: 'LOTEP', url: 'https://bichocerto.com/resultados/pb/pt-lotep/' },
    { nome: 'LOTECE', url: 'https://bichocerto.com/resultados/lce/lotece/' },
    { nome: 'LBR', url: 'https://bichocerto.com/resultados/lbr/brasilia/' },
    { nome: 'MALUCA', url: 'https://bichocerto.com/resultados/mba/maluquinha-bahia/' },
    { nome: 'FEDERAL', url: 'https://bichocerto.com/resultados/fd/loteria-federal/' },
    { nome: 'RIO', url: 'https://bichocerto.com/resultados/rj/para-todos/' },
    { nome: 'SP/BAND', url: 'https://bichocerto.com/resultados/sp/pt-band/' },
    { nome: 'NACIONAL', url: 'https://bichocerto.com/resultados/ln/loteria-nacional/' }
];

async function scrapeBichoCerto(loteriaInfo) {
    const { nome, url } = loteriaInfo;
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

        $('table tbody tr, .result-group-item').each((i, row) => {
            if (i >= 7) return false;
            
            const tds = $(row).find('td, div');
            let posicao = "N/A", milhar = "", grupo = "", bicho = "";

            tds.each((idx, el) => {
                const txt = $(el).text().trim().replace('.', '');
                if (txt.length >= 3 && txt.length <= 4 && !isNaN(txt)) milhar = txt.padStart(4, '0');
                else if (txt.length <= 2 && !isNaN(txt)) grupo = txt;
                else if (isNaN(txt) && txt.length > 3) bicho = txt;
                else if (idx === 0) posicao = txt;
            });

            if (milhar !== "" && grupo !== "") {
                results.push({ loteria: nome, horario: "N/A", posicao, milhar, grupo: parseInt(grupo), bicho, data_sorteio: dataHoje });
            }
        });
        return results;
    } catch (e) {
        console.error(`[ERRO] ${nome}:`, e.message);
        if (browser) await browser.close();
        return [];
    }
}

async function rodar() {
    try {
        let todos = [];
        for (const l of loteriasParaScrapear) {
            todos.push(...await scrapeBichoCerto(l));
        }

        if (todos.length > 0) {
            // Enviando direto para o Webhook do Make (que salvará na Planilha)
            const WEBHOOK = 'https://hook.us2.make.com/ee4umw7oa8p4hwgob4kqlpvqxy7bxdh4';
            await axios.post(WEBHOOK, { resultados: todos });
            console.log("Sucesso! Dados enviados para o Make/Sheets.");
        }
    } catch (e) { console.error(e.message); }
}

rodar();
