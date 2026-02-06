require('dotenv').config(); 
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
const puppeteer = require('puppeteer');

// Configuração do cliente Supabase usando variáveis de ambiente
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
        const dataSorteio = new Date(); // Data e hora atual da captura

        const items = $('div.col-lg-4.mb-4').length ? $('div.col-lg-4.mb-4') : $('article.result');

        items.each((index, element) => {
            const item = $(element);
            const titulo = item.find('h5.card-title, header h3').first().text().trim();
            const horarioMatch = titulo.match(/(\d{2}:\d{2})/i) || titulo.match(/(\d{2}h)/i);
            const horario = horarioMatch ? horarioMatch[0].replace('h', ':00') : 'N/A';

            item.find('table tbody tr, .result-group-item').each((i, row) => {
                if (i >= 7) return false; // Limita aos 7 primeiros prêmios

                const tds = $(row).find('td');
                let posicao, milhar, grupo, bicho;

                if (tds.length >= 4) {
                    posicao = $(tds[0]).text().trim();
                    milhar = $(tds[1]).text().trim();
                    grupo = $(tds[2]).text().trim();
                    bicho = $(tds[3]).text().trim();

                    if (milhar && !isNaN(parseInt(grupo))) {
                        resultadosDaPagina.push({ 
                            loteria: nome, 
                            horario, 
                            bicho, 
                            grupo: parseInt(grupo), 
                            milhar, 
                            posicao,
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

        // 1. LIMPEZA: Remove dados com mais de 30 dias
        const limite = new Date();
        limite.setDate(limite.getDate() - 30);
        console.log(`Limpando dados anteriores a: ${limite.toISOString()}`);
        
        await supabase
            .from('resultados')
            .delete()
            .lt('data_sorteio', limite.toISOString());

        // 2. FILTRO: Define quais loterias rodam hoje (Federal apenas Qua e Sáb)
        const diaSemana = new Date().getDay();
        const loteriasParaHoje = loteriasParaScrapear.filter(l => 
            l.nome !== 'FEDERAL' || (diaSemana === 3 || diaSemana === 6)
        );

        // 3. EXECUÇÃO: Percorre as URLs e raspa os dados
        let todosOsResultados = [];
        for (const loteria of loteriasParaHoje) {
            const resultados = await scrapeBichoCerto(loteria);
            todosOsResultados.push(...resultados);
        }

        console.log(`Total encontrado: ${todosOsResultados.length}`);

        // 4. SALVAMENTO (UPSERT): Insere novos ou atualiza existentes baseado no índice único
        if (todosOsResultados.length > 0) {
            const { error } = await supabase
