require('dotenv').config(); 
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
const puppeteer = require('puppeteer');

// Configuração do Supabase
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
    let browser = null;
    try {
        console.log(`- Raspando: ${nome}`);
        browser = await puppeteer.launch({ 
            headless: "new", 
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36');
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        const html = await page.content();
        await browser.close();

        const $ = cheerio.load(html);
        const resultadosDaPagina = [];
        const dataSorteio = new Date();

        const items = $('div.col-lg-4.mb-4').length ? $('div.col-lg-4.mb-4') : $('article.result');

        items.each((index, element) => {
            const item = $(element);
            const titulo = item.find('h5.card-title, header h3').first().text().trim();
            const horarioMatch = titulo.match(/(\d{2}:\d{2})/i) || titulo.match(/(\d{2}h)/i);
            const horario = horarioMatch ? horarioMatch[0].replace('h', ':00') : 'N/A';

            item.find('table tbody tr, .result-group-item').each((i, row) => {
                if (i >= 7) return false;
                const tds = $(row).find('td');
                if (tds.length >= 4) {
                    const posicao = $(tds[0]).text().trim();
                    const milhar = $(tds[1]).text().trim();
                    const grupo = $(tds[2]).text().trim();
                    const bicho = $(tds[3]).text().trim();

                    if (milhar && !isNaN(parseInt(grupo))) {
                        resultadosDaPagina.push({ 
                            loteria: nome, horario, bicho, 
                            grupo: parseInt(grupo), milhar, posicao,
                            data_sorteio: dataSorteio.toISOString() 
                        });
                    }
                }
            });
        });
        return resultadosDaPagina;
    } catch (error) {
        console.error(`Erro em ${nome}: ${error.message}`);
        if (browser) await browser.close();
        return [];
    }
}

async function rodarProcessoDeScraping() {
    try {
        console.log("=== INICIANDO PROCESSO ===");
        
        const limite = new Date();
        limite.setDate(limite.getDate() - 30);
        await supabase.from('resultados').delete().lt('data_sorteio', limite.toISOString());

        const hoje = new Date().getDay();
        const loteriasParaHoje = loteriasParaScrapear.filter(l => l.nome !== 'FEDERAL' || (hoje === 3 || hoje === 6));

        let todos = [];
        for (const loteria of loteriasParaHoje) {
            const res = await scrapeBichoCerto(loteria);
            todos.push(...res);
        }

        console.log(`Total encontrado: ${todos.length}`);

        if (todos.length > 0) {
            const { error } = await supabase.from('resultados').upsert(todos, { 
                onConflict: 'loteria,horario,posicao,data_sorteio' 
            });
            if (error) {
                console.error("Erro Supabase:", error.message);
            } else {
                console.log("SUCESSO: Dados salvos!");
            }
        }
    } catch (e) {
        console.error("ERRO FATAL:", e.message);
        process.exit(1);
    }
}

rodarProcessoDeScraping();
