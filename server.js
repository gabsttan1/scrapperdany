require('dotenv').config();
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

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
                    
                    tds.each((idx, td) => {
                        const texto = $(td).text().trim().replace('.', '');
                        if (texto.length >= 3 && texto.length <= 4 && !isNaN(texto)) {
                            milhar = texto;
                            const possivelGrupo = $(tds[idx + 1]).text().trim();
                            if (possivelGrupo.length <= 2 && !isNaN(possivelGrupo)) {
                                grupo = possivelGrupo;
                            }
                        }
                    });
                    bicho = $(tds[tds.length - 1]).text().trim();
                }

                if (milhar !== "" && grupo !== "") {
                    resultadosDaPagina.push({ 
                        loteria: nome, 
                        horario: horario, 
                        posicao: posicao,
                        // Adicionamos o apóstrofo aqui para forçar o formato de texto no Sheets
                        milhar: "'" + String(milhar).padStart(4, '0'), 
                        grupo: parseInt(grupo), 
                        bicho: bicho,
                        data_sorteio: dataHoje 
                    });
                }
            });
        });
        return resultadosDaPagina;
    } catch (error) {
        console.error(`Erro ao raspar ${nome}:`, error.message);
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
            console.log(`Enviando ${todos.length} resultados para o Sheets...`);
            const serviceAccountAuth = new JWT({
                email: SERVICE_ACCOUNT_EMAIL,
                key: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON).private_key,
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });

            const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
            await doc.loadInfo();
            const sheet = doc.sheetsByIndex[0];
            await sheet.addRows(todos);
            console.log("SUCESSO: Dados salvos!");
        }
    } catch (e) { console.error("Erro final:", e.message); }
}
rodar();
