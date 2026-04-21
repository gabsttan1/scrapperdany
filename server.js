const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// CONFIGURAÇÃO
const SPREADSHEET_ID = '1yh7an-SMWRbHSpRX1BzNnaarV1abfZeRXiAlNDN-nsk'; 
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
    console.log(`--- Raspando: ${nome} ---`);
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

        // Procura os cards que contêm as tabelas
        $('.result-card, .result-item, .card, table').each((index, block) => {
            // Tenta pegar o horário se existir no título ou linha anterior
            const titulo = $(block).find('h3, h5, .card-header').first().text().trim();
            const horarioMatch = titulo.match(/(\d{1,2}:\d{2})|(\d{1,2}h)/);
            const horario = horarioMatch ? horarioMatch[0] : "Principal";

            $(block).find('tr').each((i, row) => {
                const tds = $(row).find('td');
                if (tds.length < 3) return;

                const posicao = $(tds[0]).text().trim();
                const milhar = $(tds[1]).text().trim().replace('.', '');
                const grupo = $(tds[2]).text().trim();
                const bicho = tds.length > 3 ? $(tds[3]).text().trim() : "";

                if (!isNaN(milhar) && milhar.length >= 3) {
                    results.push({ 
                        loteria: nome, 
                        horario: horario,
                        posicao: posicao,
                        milhar: milhar.padStart(4, '0'), 
                        grupo: grupo, 
                        bicho: bicho, 
                        data_sorteio: dataHoje 
                    });
                }
            });
        });
        
        console.log(`Encontramos ${results.length} resultados para ${nome}`);
        return results;
    } catch (e) {
        console.error(`Erro ao raspar ${nome}: ${e.message}`);
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
            console.log(`Salvando ${todos.length} linhas na planilha...`);
            const serviceAccountAuth = new JWT({
                email: SERVICE_ACCOUNT_EMAIL,
                key: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON).private_key,
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });

            const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
            await doc.loadInfo();
            const sheet = doc.sheetsByIndex[0];
            await sheet.addRows(todos);
            console.log("Sucesso! Planilha atualizada.");
        } catch (error) {
            console.error("Erro final ao salvar:", error.message);
        }
    } else {
        console.log("Nenhum dado encontrado para salvar.");
    }
}
rodar();
