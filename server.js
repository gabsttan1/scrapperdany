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
    console.log(`[DEBUG] Iniciando raspagem: ${nome}`);
    
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
        console.log(`[DEBUG] ${nome}: Capturou ${results.length} resultados.`);
        return results;
    } catch (e) {
        console.error(`[ERRO] Ao processar ${nome}:`, e.message);
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
            console.log(`[DEBUG] Salvando ${todos.length} resultados no Supabase...`);
            const { error } = await supabase.from('resultados').upsert(todos, { onConflict: 'loteria,horario,posicao,data_sorteio' });
            
            if (error) {
                console.error("[ERRO SUPABASE]", error);
            } else {
                console.log("[DEBUG] Supabase salvo com sucesso!");
            }

            const WEBHOOK = 'https://hook.us2.make.com/ee4umw7oa8p4hwgob4kqlpvqxy7bxdh4';
            await axios.post(WEBHOOK, todos);
            console.log("[DEBUG] Dados enviados para o Make.");
        } else {
            console.log("[DEBUG] Nenhum dado novo para salvar.");
        }
    } catch (e) { 
        console.error("[ERRO FINAL]", e.message); 
    }
}

rodar();
