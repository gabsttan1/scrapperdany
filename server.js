require('dotenv').config(); 
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
const puppeteer = require('puppeteer');
const axios = require('axios');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

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
    let browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
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
            // Se tem 3 ou 4 dígitos -> Milhar
            if (txt.length >= 3 && txt.length <= 4 && !isNaN(txt)) milhar = txt.padStart(4, '0');
            // Se tem 1 ou 2 dígitos -> Grupo
            else if (txt.length <= 2 && !isNaN(txt)) grupo = txt;
            // Se é texto -> Bicho
            else if (isNaN(txt) && txt.length > 3) bicho = txt;
            else if (idx === 0) posicao = txt;
        });

        if (milhar !== "" && grupo !== "") {
            results.push({ 
                loteria: nome, 
                horario: "N/A", 
                posicao, 
                milhar, 
                grupo: parseInt(grupo), 
                bicho, 
                data_sorteio: dataHoje 
            });
        }
    });
    return results;
}

async function rodar() {
    try {
        let todos = [];
        for (const l of loteriasParaScrapear) todos.push(...await scrapeBichoCerto(l));

        if (todos.length > 0) {
            await supabase.from('resultados').upsert(todos, { onConflict: 'loteria,horario,posicao,data_sorteio' });
            
            // COLE AQUI SEU WEBHOOK:
            const WEBHOOK = 'https://hook.us2.make.com/ee4umw7oa8p4hwgob4kqlpvqxy7bxdh4';
            if (WEBHOOK.startsWith('http')) await axios.post(WEBHOOK, todos);
            console.log("Sucesso!");
        }
    } catch (e) { console.error(e.message); }
}
rodar();