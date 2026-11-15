// Weekly snapshot of the SensCritique film rankings.
//
// - One ranking per year ("Les meilleurs films de <année>"), plus the all-time
//   "Top 100 des Tops 10 films".
// - data/index.json lists the tracked rankings.
// - data/<key>.json holds the films and one ordered list of film ids per date.
// - New years are discovered automatically from the SensCritique poll list,
//   so nothing has to be edited when a new yearly ranking opens.
//
// Usage: node fetch.js

const fs = require('fs');
const path = require('path');

const API = 'https://apollo.senscritique.com/';
const SITE = 'https://www.senscritique.com';
const DATA_DIR = path.join(__dirname, 'data');
const INDEX_FILE = path.join(DATA_DIR, 'index.json');
const FIRST_YEAR = 2024; // older rankings are frozen and have no history worth tracking
const YEARLY_POLL = /^\/top\/resultats\/les_meilleurs_films_de_(\d{4})\/(\d+)$/;
const ALL_TIME = {
    key: 'all-time',
    top: 'TOP_100_OUT_OF_TOP_10',
    label: 'Top 100 des Tops 10 films',
    url: `${SITE}/films/tops/top100-des-top10`,
    everyDays: 28, // it barely moves from one week to the next
};
const FILM_FIELDS = 'id title url dateRelease yearOfProduction medias { picture } directors { name }';

async function query(query, variables = {}) {
    const response = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: '*/*' },
        body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    if (json.errors?.length) throw new Error(json.errors[0].message);
    return json.data;
}

// ---------- storage ----------

function readJson(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') return fallback;
        throw error;
    }
}

function loadIndex() {
    return readJson(INDEX_FILE, { rankings: [] });
}

function loadRanking(key) {
    return readJson(path.join(DATA_DIR, `${key}.json`), { movies: {}, snapshots: {} });
}

// One film and one date per line: a weekly update is a one-line diff.
function saveRanking(key, ranking) {
    const lines = (object, keys) =>
        keys.map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(object[k])}`).join(',\n');
    const movieIds = Object.keys(ranking.movies).sort((a, b) => a - b);
    const dates = Object.keys(ranking.snapshots).sort();
    const text = `{\n  "movies": {\n${lines(ranking.movies, movieIds)}\n  },\n  "snapshots": {\n${lines(ranking.snapshots, dates)}\n  }\n}\n`;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, `${key}.json`), text);
    return dates.length;
}

function saveIndex(index) {
    index.rankings.sort((a, b) => a.key.localeCompare(b.key));
    const rows = index.rankings.map((r) => `    ${JSON.stringify(r)}`).join(',\n');
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(INDEX_FILE, `{\n  "rankings": [\n${rows}\n  ]\n}\n`);
}

// Records the ranking of one date. `products` is the ordered list of films.
function addSnapshot(ranking, date, products) {
    for (const product of products) {
        const movie = { title: product.title };
        // Year of first release, as SensCritique shows it next to the title.
        const year = Number((product.dateRelease || '').slice(0, 4)) || product.yearOfProduction;
        if (year) movie.year = year;
        const directors = (product.directors || []).map((d) => d.name).join(', ');
        if (directors) movie.directors = directors;
        if (product.url) movie.url = product.url;
        if (product.medias?.picture) movie.picture = product.medias.picture;
        ranking.movies[product.id] = { ...ranking.movies[product.id], ...movie };
    }
    ranking.snapshots[date] = products.map((product) => product.id);
}

// ---------- SensCritique ----------

async function discoverRankings(index) {
    const data = await query(`{ polls(universe: "movie", limit: 50) { items { id label url } } }`);
    for (const poll of data.polls.items) {
        const match = YEARLY_POLL.exec(poll.url);
        if (!match || Number(match[1]) < FIRST_YEAR) continue;
        const key = match[1];
        if (index.rankings.some((r) => r.key === key)) continue;
        index.rankings.push({ key, pollId: poll.id, label: poll.label, url: SITE + poll.url });
        console.log(`New ranking found: ${poll.label}`);
    }
}

async function fetchProducts(entry) {
    const data = entry.top
        ? await query(`{ top(universe: "movie", subtype: ${entry.top}, limit: 100, offset: 0) { ${FILM_FIELDS} } }`)
        : await query(`query Poll($id: Int!) { poll(id: $id) { products(limit: 100, offset: 0) { ${FILM_FIELDS} } } }`, { id: entry.pollId });
    const products = (entry.top ? data.top : data.poll?.products) || [];
    if (!products.length) throw new Error('empty ranking');
    return products;
}

async function main() {
    const today = new Date().toISOString().slice(0, 10);
    const index = loadIndex();
    index.rankings = [...index.rankings.filter((r) => r.key !== ALL_TIME.key), ALL_TIME];
    let failures = 0;

    try {
        await discoverRankings(index);
    } catch (error) {
        failures++;
        console.error(`Could not look for new rankings: ${error.message}`);
    }

    for (const entry of index.rankings) {
        try {
            const ranking = loadRanking(entry.key);
            const last = Object.keys(ranking.snapshots).sort().at(-1);
            if (entry.everyDays && last && (Date.parse(today) - Date.parse(last)) / 86400000 < entry.everyDays) {
                console.log(`${entry.label}: skipped, last saved ${last}`);
                continue;
            }
            addSnapshot(ranking, today, await fetchProducts(entry));
            const count = saveRanking(entry.key, ranking);
            console.log(`${entry.label}: saved ${today} (${count} snapshots)`);
        } catch (error) {
            failures++;
            console.error(`${entry.label}: ${error.message}`);
        }
    }

    saveIndex(index);
    // Whatever succeeded is saved; a non-zero exit makes the scheduled job visibly fail.
    if (failures) process.exitCode = 1;
}

main();
