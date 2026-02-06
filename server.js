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

async function rodarProcessoDeScraping() {
    try {
        // Limpeza de 30 dias
        const limite = new Date();
        limite.setDate(limite.getDate() - 30);
        console.log("Removendo dados com mais de 30 dias...");
        await supabase.from('resultados').delete().lt('data_sorteio', limite.toISOString());

        // ... (Lógica de scraping similar ao anterior, mas usando .upsert ao final)
        // No final do loop de scraping:
        // await supabase.from('resultados').upsert(todosOsResultados, { onConflict: 'loteria,horario,posicao,data_sorteio' });
    } catch (e) { console.error(e); process.exit(1); }
}
rodarProcessoDeScraping();