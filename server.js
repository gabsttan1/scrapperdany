const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// CONFIGURAÇÃO
const SPREADSHEET_ID = '1yh7an-SMWRbHSpRX1BzNnaarV1abfZeRXiAlNDN-nsk'; // COLOQUE O SEU ID AQUI
const SERVICE_ACCOUNT_EMAIL = 'resultados-sheets@sheets-494017.iam.gserviceaccount.com';

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
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        const html = await page.content();
        await browser.close();

        const $ = cheerio.load(html);
        const results = [];
        const dataHoje = new Date().toISOString().split('T')[0];

        // Procura tabelas de resultados
        $('table').each((index, table) => {
            $(table).find('tr').each((i, row) => {
                const tds = $(row).find('td');
                if (tds.length < 3) return; // Pula cabeçalhos ou linhas vazias

                let posicao = $(tds[0]).text().trim();
                let milhar = $(tds[1]).text().trim().replace('.', '');
                let grupo = $(tds[2]).text().trim();
                let bicho = tds.length > 3 ? $(tds[3]).text().trim() : "";

                // Limpeza básica
                milhar = milhar.padStart(4, '0');
                
                // Valida se é um resultado real
                if (!isNaN(milhar) && milhar.length === 4) {
                    results.push({ 
                        loteria: nome, 
                        posicao: posicao, 
                        milhar: milhar, 
                        grupo: grupo, 
                        bicho: bicho, 
                        data_sorteio: dataHoje 
                    });
                }
            });
        });
        return results;
    } catch (e) {
        if (browser) await browser.close();
        return [];
    }
}

async function rodar() {
    let todos = [];
    for (const l of loteriasParaScrapear) {
        todos.push(...await scrapeBichoCerto(l));
    }

    if (todos.length > 0) {
        try {
            const serviceAccountAuth = new JWT({
                email: SERVICE_ACCOUNT_EMAIL,
                key: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON).private_key,
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });

            const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
            await doc.loadInfo();
            const sheet = doc.sheetsByIndex[0];
            await sheet.addRows(todos);
            console.log(`Sucesso! ${todos.length} linhas enviadas.`);
        } catch (error) {
            console.error("Erro no Sheets:", error.message);
        }
    }
}
rodar();
