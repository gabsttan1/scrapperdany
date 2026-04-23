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
    console.log(`- Raspando: ${nome}`);
    let browser = null;
    try {
        browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36');
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        const html = await page.content();
        await browser.close();

        const $ = cheerio.load(html);
        const resultadosDaPagina = [];
        const dataHoje = new Date().toISOString().split('T')[0];

        // Seleciona os blocos de resultados (os cards)
        $('div[id^="div_display_"]').each((index, container) => {
            const titulo = $(container).find('.card-title').first().text().trim();
            const horarioMatch = titulo.match(/(\d{1,2}:\d{2})/) || titulo.match(/(\d{1,2}h)/);
            const horario = horarioMatch ? horarioMatch[0].replace('h', ':00') : 'N/A';

            $(container).find('table tbody tr').each((i, row) => {
                const tds = $(row).find('td');
                if (tds.length < 4) return;

                const posicao = $(tds[0]).text().trim();
                const milhar = $(tds[2]).find('a').text().trim().replace('.', '');
                const grupo = $(tds[3]).text().trim();
                const bicho = $(tds[4]).text().trim();

                if (!isNaN(milhar) && milhar.length >= 3) {
                    resultadosDaPagina.push({ 
                        loteria: nome, 
                        horario: horario, 
                        posicao: posicao,
                        // Apóstrofo força texto no Sheets, mantendo o zero inicial
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
    // --- Porteiro: Bloqueia execução antes das 07:50 ---
    const dataHoraBrasil = new Date().toLocaleString("en-US", {timeZone: "America/Sao_Paulo"});
    const agora = new Date(dataHoraBrasil);
    const horaAgora = agora.getHours();
    const minutoAgora = agora.getMinutes();

    if (horaAgora < 7 || (horaAgora === 7 && minutoAgora < 50)) {
        console.log(`--- Script ignorado: Horário de descanso (${horaAgora}:${minutoAgora}) ---`);
        return;
    }
    // ----------------------------------------------------

    try {
        let todos = [];
        console.log("=== INICIANDO RASPAGEM ===");
        
        for (const l of loteriasParaScrapear) {
            todos.push(...await scrapeBichoCerto(l));
        }

        if (todos.length > 0) {
            console.log(`Raspagem concluída. Total capturado: ${todos.length}. Verificando duplicados...`);
            
            const serviceAccountAuth = new JWT({
                email: SERVICE_ACCOUNT_EMAIL,
                key: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON).private_key,
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });

            const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
            await doc.loadInfo();
            const sheet = doc.sheetsByIndex[0];
            
            // Pega as linhas existentes para filtrar duplicados
            const rows = await sheet.getRows();
            const existingKeys = new Set(rows.map(r => 
                `${r.get('loteria')}-${r.get('horario')}-${r.get('posicao')}-${r.get('data_sorteio')}`
            ));

            // Filtra o que é novo
            const toAdd = todos.filter(novo => {
                const key = `${novo.loteria}-${novo.horario}-${novo.posicao}-${novo.data_sorteio}`;
                return !existingKeys.has(key);
            });

            if (toAdd.length > 0) {
                await sheet.addRows(toAdd);
                console.log(`SUCESSO: ${toAdd.length} novos resultados adicionados.`);
            } else {
                console.log("Nenhum dado novo encontrado (todos já estavam na planilha).");
            }
        } else {
            console.log("Nenhum resultado foi capturado nesta rodada.");
        }
    } catch (e) { 
        console.error("Erro no processo rodar():", e.message); 
    }
}
rodar();
