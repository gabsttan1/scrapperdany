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

        // Seleciona os blocos de resultados
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
                
                let posicao, milhar, grupo, bicho;

                // AJUSTE DE MAPEAMENTO: Corrigindo a ordem das colunas baseada na estrutura do site
                if (tds.length >= 4) {
                    posicao = $(tds[0]).text().trim();
                    // No site, geralmente a ordem é: Posicao | Premio (Milhar) | Grupo | Bicho
                    milhar = $(tds[1]).text().trim().replace('.', ''); 
                    grupo = $(tds[2]).text().trim();
                    bicho = $(tds[3]).text().trim();
                } else {
                    // Fallback para layout estilo lista (Nacional)
                    posicao = $(row).find('.prize').text().trim();
                    milhar = $(row).find('.number').text().trim().replace('.', '');
                    const animalText = $(row).find('.animal-name').text().trim();
                    const grupoMatch = animalText.match(/\((\d+)\)/);
                    if (grupoMatch) {
                        grupo = grupoMatch[1];
                        bicho = animalText.replace(/\(\d+\)\s*/, '').trim();
                    }
                }

                if (milhar !== "" && grupo !== "" && !isNaN(parseInt(grupo))) {
                    resultadosDaPagina.push({ 
                        loteria: nome, 
                        horario, 
                        posicao,
                        milhar: String(milhar), // Agora salva na coluna correta (Text) para manter o zero
                        grupo: parseInt(grupo),  // Agora salva o número do grupo (1-25)
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
            else console.log("SUCESSO: Colunas corrigidas e dados salvos!");
        }
    } catch (e) { console.error(e.message); }
}
rodar();
