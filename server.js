require('dotenv').config(); 
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
const puppeteer = require('puppeteer');

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
        browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36');
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        const html = await page.content();
        await browser.close();

        const $ = cheerio.load(html);
        const resultadosDaPagina = [];
        const dataHoje = new Date().toISOString().split('T')[0];

        const items = $('div.col-lg-4.mb-4, article.result, .result-card');

        items.each((index, element) => {
            const item = $(element);
            const titulo = item.find('h5.card-title, header h3, .card-header').first().text().trim();
            const horarioMatch = titulo.match(/(\d{1,2}:\d{2})/) || titulo.match(/(\d{1,2}h)/);
            const horario = horarioMatch ? horarioMatch[0].replace('h', ':00') : 'N/A';

            const rows = item.find('table tbody tr, .result-group-item');
            
            rows.each((i, row) => {
                if (i >= 7) return false;
                const tds = $(row).find('td');
                
                let posicao = "N/A", milhar = "", grupo = "", bicho = "";

                if (tds.length >= 4) {
                    posicao = $(tds[0]).text().trim();
                    
                    // LÓGICA DE DETECÇÃO INTELIGENTE
                    // Percorre as colunas para identificar qual é a milhar (3 ou 4 dígitos)
                    tds.each((idx, td) => {
                        const texto = $(td).text().trim().replace('.', '');
                        if (texto.length >= 3 && texto.length <= 4 && !isNaN(texto)) {
                            milhar = texto;
                            // O grupo costuma ser a próxima coluna ou a anterior
                            const possivelGrupo = $(tds[idx + 1]).text().trim();
                            if (possivelGrupo.length <= 2 && !isNaN(possivelGrupo)) {
                                grupo = possivelGrupo;
                            }
                        }
                    });
                    
                    bicho = $(tds[tds.length - 1]).text().trim();
                }

                // Validação final para garantir que nada vá trocado
                if (milhar !== "" && grupo !== "") {
                    resultadosDaPagina.push({ 
                        loteria: nome, 
                        horario, 
                        posicao,
                        milhar: String(milhar).padStart(4, '0'), // Garante 4 dígitos (ex: 0681)
                        grupo: parseInt(grupo), 
                        bicho,
                        data_sorteio: dataHoje 
                    });
                }
            });
        });
        return resultadosDaPagina;
    } catch (error) {
        if (browser) await browser.close();
        return [];
    }
}

async function rodar() {
    try {
        console.log("=== INICIANDO ===");
        const limite = new Date();
        limite.setDate(limite.getDate() - 30);
        await supabase.from('resultados').delete().lt('data_sorteio', limite.toISOString().split('T')[0]);

        let todos = [];
        for (const l of loteriasParaScrapear) {
            const res = await scrapeBichoCerto(l);
            todos.push(...res);
        }

        if (todos.length > 0) {
            const { error } = await supabase.from('resultados').upsert(todos, { 
                onConflict: 'loteria,horario,posicao,data_sorteio' 
            });
            if (error) console.error("Erro:", error.message);
            else console.log("SUCESSO: Dados corrigidos e salvos!");
        }
    } catch (e) { console.error(e.message); }
}
rodar();
