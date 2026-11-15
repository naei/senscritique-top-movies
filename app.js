const SITE = 'https://www.senscritique.com';
const STEP_MS = 640; // playback: time per snapshot at ×1
const SPEEDS = [1, 2, 4];
const DAY = 86400000;

const $ = (id) => document.getElementById(id);
const el = {
    years: $('years'), pollLink: $('poll-link'), note: $('note'), list: $('list'), empty: $('empty'), status: $('status'),
    timeline: document.querySelector('.timeline'), play: $('play'), track: $('track'), now: $('now'),
    slider: $('slider'), ticks: $('ticks'), speed: $('speed'), panel: $('panel'), chart: $('chart'), tip: $('tip'),
};

const toDate = (iso) => new Date(`${iso}T00:00:00Z`);
const toDay = (iso) => Math.round(toDate(iso).getTime() / DAY);
const toIso = (day) => new Date(day * DAY).toISOString().slice(0, 10);
const longFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const monthYear = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthFormat = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' });
const longDate = (iso) => longFormat.format(toDate(iso));
const shortDate = (iso) => shortFormat.format(toDate(iso));
const ordinal = (n) => (n === 1 ? '1er' : `${n}e`);
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

// One ranking at a time: `ranking` is a year's top or the all-time top, and the
// timeline covers its whole history. `date` can be any day in between; the list
// shows the latest snapshot taken on or before it.
// `home` is the ranking shown by default: the most recent year.
const state = { rankings: [], home: null, ranking: null, date: null, playing: false, speed: 0, openId: null, shown: null };
const rows = new Map(); // film id -> <li>
let playTimer, orderTimer, urlTimer, statusTimer, chart;

// ---------- loading ----------

async function getJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
}

async function init() {
    try {
        const index = await getJson('data/index.json');
        const entries = [...index.rankings].sort((a, b) => a.key.localeCompare(b.key));
        // A ranking whose file is missing or empty is skipped rather than breaking the page.
        const files = await Promise.allSettled(entries.map((entry) => getJson(`data/${entry.key}.json`)));
        state.rankings = entries.flatMap((entry, n) => {
            const { movies, snapshots = {} } = files[n].value || {};
            const dates = Object.keys(snapshots).sort();
            if (!dates.length) return [];
            const firstSeen = new Map();
            dates.forEach((d, k) => {
                for (const id of snapshots[d]) if (id != null && !firstSeen.has(id)) firstSeen.set(id, k);
            });
            return [{ ...entry, movies, snapshots, dates, firstSeen }];
        });
        if (!state.rankings.length) throw new Error('no ranking');
    } catch (error) {
        console.error(error);
        el.empty.hidden = false;
        el.empty.textContent = 'Le classement n\'a pas pu être chargé. Rechargez la page pour réessayer.';
        return;
    }

    // Most recent year first, the all-time top last.
    const years = state.rankings.filter((r) => /^\d{4}$/.test(r.key)).reverse();
    const others = state.rankings.filter((r) => !years.includes(r));
    el.years.append(...[...years, ...others].map((r) => new Option(years.includes(r) ? r.key : 'Tous les temps', r.key)));
    el.years.addEventListener('change', () => { pause(); openRanking(el.years.value); });

    const params = new URLSearchParams(location.search);
    const wanted = state.rankings.find((r) => r.key === params.get('top'));
    const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date')) ? params.get('date') : null;
    state.home = (years[0] || others[0]).key;
    openRanking(wanted ? wanted.key : state.home, date);
}

// ---------- which ranking, which date ----------

// Opens a ranking on the given date, or on its latest snapshot.
function openRanking(key, date) {
    const ranking = state.rankings.find((r) => r.key === key);
    state.ranking = ranking;
    el.years.value = key;

    const first = ranking.dates[0], last = ranking.dates.at(-1);
    el.slider.min = toDay(first);
    el.slider.max = toDay(last);
    el.slider.disabled = el.play.disabled = el.speed.disabled = ranking.dates.length < 2;
    drawTicks();

    el.pollLink.textContent = ranking.label;
    el.pollLink.href = ranking.url;
    // For a year's ranking, the stretch of timeline after that year is hatched.
    const isYear = /^\d{4}$/.test(key);
    const min = toDay(first), max = toDay(last);
    const yearEnd = isYear ? toDay(`${Number(key) + 1}-01-01`) : Infinity;
    const hasAfter = yearEnd < max;
    el.slider.style.setProperty('--after', hasAfter ? Math.max(0, (yearEnd - min) / (max - min)) : 2);
    el.note.textContent = !isYear
        ? `Les 100 films préférés des membres de SensCritique, toutes années confondues, d'après leurs top 10.`
        : `Les films sortis en France en ${key}, classés par les membres de SensCritique. La frise suit ce classement à partir de ${monthYear.format(toDate(first))} et continue d'évoluer après la fin de l'année, tant que les membres votent.`;

    state.date = !date || date > last ? last : date < first ? first : date;
    render();
}

function setDate(date) {
    const first = state.ranking.dates[0], last = state.ranking.dates.at(-1);
    const next = date < first ? first : date > last ? last : date;
    if (next === state.date) return;
    state.date = next;
    render();
}

// Index of the last snapshot taken on or before the date.
function snapshotAt(ranking, date) {
    let index = 0;
    ranking.dates.forEach((d, k) => { if (d <= date) index = k; });
    return index;
}

// Playback and arrow keys move from one snapshot to the next.
const nextStop = () => state.ranking.dates.find((d) => d > state.date);
const previousStop = () => state.ranking.dates.findLast((d) => d < state.date);

// ---------- ranking ----------

function render() {
    const { ranking } = state;
    const index = snapshotAt(ranking, state.date);

    // Sliding between two snapshots moves the date but not the list.
    if (state.shown?.ranking !== ranking || state.shown.index !== index) {
        state.shown = { ranking, index };
        renderList(ranking, index);
    }

    const min = Number(el.slider.min), max = Number(el.slider.max), day = toDay(state.date);
    const progress = max > min ? (day - min) / (max - min) : 1;
    el.slider.value = day;
    el.slider.style.setProperty('--p', `${progress * 100}%`);
    el.slider.setAttribute('aria-valuetext', `${longDate(state.date)}, ${ranking.label}`);
    el.track.style.setProperty('--pn', progress);
    el.now.textContent = shortDate(state.date);

    clearTimeout(urlTimer);
    urlTimer = setTimeout(() => {
        const params = new URLSearchParams();
        if (ranking.key !== state.home) params.set('top', ranking.key);
        if (state.date !== ranking.dates.at(-1)) params.set('date', state.date);
        try { history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`); } catch { /* rate-limited: harmless */ }
    }, 300);
    announce();
    if (el.panel.open) renderPanel();
}

function renderList(ranking, index) {
    const order = ranking.snapshots[ranking.dates[index]];
    const previous = new Map();
    if (index > 0) ranking.snapshots[ranking.dates[index - 1]].forEach((id, position) => previous.set(id, position));

    const present = new Set();
    order.forEach((id, position) => {
        if (id == null) return;
        present.add(id);
        const li = rows.get(id) || createRow(id, ranking.movies[id]);
        li.classList.remove('out');
        li.style.setProperty('--i', position);
        li.querySelector('.rank').textContent = position + 1;
        setDelta(li.querySelector('.delta'), ranking, index, id, position, previous);
    });
    for (const [id, li] of rows) {
        if (present.has(id) || li.classList.contains('out')) continue;
        li.classList.add('out');
        setTimeout(() => {
            if (!li.classList.contains('out')) return;
            li.remove();
            if (rows.get(id) === li) rows.delete(id);
        }, 320);
    }
    el.list.style.setProperty('--n', order.length);
    syncDomOrder(order);
}

function createRow(id, movie = { title: `Film ${id}` }) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'row';
    button.addEventListener('click', () => openPanel(id));

    const rank = document.createElement('span');
    rank.className = 'rank';

    const poster = document.createElement('img');
    poster.className = 'poster';
    poster.alt = '';
    poster.width = 44;
    poster.height = 60;
    poster.loading = 'lazy';
    poster.decoding = 'async';
    if (movie.picture) poster.src = movie.picture.replace('/300/', '/100/');

    const film = document.createElement('span');
    film.className = 'film';
    const title = document.createElement('strong');
    title.textContent = movie.title;
    film.append(title);
    if (movie.directors) {
        const directors = document.createElement('span');
        directors.textContent = movie.directors;
        film.append(directors);
    }

    const delta = document.createElement('span');
    delta.className = 'delta';

    button.append(rank, poster, film, delta);
    li.append(button);
    el.list.append(li);
    rows.set(id, li);
    return li;
}

// Movement since the previous snapshot, as a glyph plus a spoken label.
function setDelta(node, ranking, index, id, position, previous) {
    let kind = 'same', text = '', label = '';
    if (index === 0) {
        // nothing to compare with
    } else if (!previous.has(id)) {
        kind = 'new';
        text = ranking.firstSeen.get(id) === index ? 'Entrée' : 'Retour';
        label = text === 'Entrée' ? 'entre dans le classement' : 'revient dans le classement';
    } else {
        const gain = previous.get(id) - position;
        if (gain > 0) { kind = 'up'; text = `▲ ${gain}`; label = `gagne ${plural(gain, 'place')}`; }
        else if (gain < 0) { kind = 'down'; text = `▼ ${-gain}`; label = `perd ${plural(-gain, 'place')}`; }
        else { text = '='; label = 'stable'; }
    }
    node.className = `delta ${kind}`;
    const visible = document.createElement('span');
    visible.setAttribute('aria-hidden', 'true');
    visible.textContent = text;
    const spoken = document.createElement('span');
    spoken.className = 'visually-hidden';
    spoken.textContent = label;
    node.replaceChildren(visible, spoken);
}

// Rows are placed with a transform so they can glide; the DOM order still has to
// follow the ranking for keyboard and screen reader users.
const canMove = 'moveBefore' in Element.prototype;
function syncDomOrder(order) {
    clearTimeout(orderTimer);
    const apply = () => {
        for (const id of order) {
            const li = rows.get(id);
            if (!li) continue;
            if (canMove) el.list.moveBefore(li, null);
            else el.list.append(li);
        }
    };
    if (canMove) apply(); // keeps running transitions and focus
    else orderTimer = setTimeout(() => { if (!el.list.contains(document.activeElement)) apply(); }, 900);
}

function announce() {
    clearTimeout(statusTimer);
    if (state.playing) return;
    statusTimer = setTimeout(() => {
        el.status.textContent = `${state.shown.ranking.label}, classement au ${longDate(state.date)}`;
    }, 500);
}

// ---------- timeline ----------

// Year labels, or month labels when the timeline covers a single year.
function drawTicks() {
    const min = Number(el.slider.min), max = Number(el.slider.max);
    el.ticks.replaceChildren();
    if (max <= min) return;
    const { dates } = state.ranking;
    const firstYear = Number(dates[0].slice(0, 4)), lastYear = Number(dates.at(-1).slice(0, 4));
    const labels = [];
    if (firstYear === lastYear) {
        for (let month = 0; month < 12; month += 2) {
            const iso = `${firstYear}-${String(month + 1).padStart(2, '0')}-01`;
            labels.push([iso, monthFormat.format(toDate(iso))]);
        }
    } else {
        for (let year = firstYear; year <= lastYear; year++) labels.push([`${year}-01-01`, year]);
    }
    let previousX = -Infinity;
    for (const [iso, text] of labels) {
        if (toDay(iso) > max) break;
        const x = Math.max(0, (toDay(iso) - min) / (max - min)) * 100;
        if (x - previousX < 9 || x > 96) continue;
        previousX = x;
        const tick = document.createElement('span');
        tick.textContent = text;
        tick.style.setProperty('--x', `${x}%`);
        el.ticks.append(tick);
    }
}

function play() {
    if (state.ranking.dates.length < 2) return;
    if (!nextStop()) setDate(state.ranking.dates[0]);
    state.playing = true;
    el.timeline.classList.add('playing');
    el.play.setAttribute('aria-label', 'Mettre en pause');
    clearInterval(playTimer);
    playTimer = setInterval(() => {
        const next = nextStop();
        if (next) setDate(next);
        if (!nextStop()) pause();
    }, STEP_MS / SPEEDS[state.speed]);
}

function pause() {
    if (!state.playing) return;
    state.playing = false;
    clearInterval(playTimer);
    el.timeline.classList.remove('playing');
    el.play.setAttribute('aria-label', 'Lancer la lecture');
    announce();
}

el.play.addEventListener('click', () => (state.playing ? pause() : play()));
el.speed.addEventListener('click', () => {
    state.speed = (state.speed + 1) % SPEEDS.length;
    el.speed.textContent = `×${SPEEDS[state.speed]}`;
    el.speed.setAttribute('aria-label', `Vitesse de lecture : ${SPEEDS[state.speed]} fois`);
    if (state.playing) play();
});
el.slider.addEventListener('input', () => { pause(); setDate(toIso(Number(el.slider.value))); });
// Arrow keys jump from one snapshot to the next instead of one day at a time.
el.slider.addEventListener('keydown', (event) => {
    const forward = { ArrowRight: true, ArrowUp: true, ArrowLeft: false, ArrowDown: false }[event.key];
    if (forward === undefined) return;
    event.preventDefault();
    pause();
    const stop = forward ? nextStop() : previousStop();
    if (stop) setDate(stop);
});

// ---------- film panel ----------

function openPanel(id) {
    pause();
    state.openId = id;
    renderPanel();
    el.panel.showModal();
}

function renderPanel() {
    const id = state.openId;
    const { ranking } = state.shown;
    const movie = ranking.movies[id];
    if (!movie) return el.panel.close();
    const { dates } = ranking;
    const index = state.shown.index;
    const series = dates.map((d) => {
        const position = ranking.snapshots[d].indexOf(id);
        return position < 0 ? null : position + 1;
    });

    $('panel-title').textContent = movie.title;
    $('panel-meta').textContent = [movie.directors, movie.year].filter(Boolean).join(', ');
    const poster = $('panel-poster');
    poster.hidden = !movie.picture;
    if (movie.picture && poster.getAttribute('src') !== movie.picture) poster.src = movie.picture;
    const link = $('panel-link');
    link.hidden = !movie.url;
    if (movie.url) link.href = SITE + movie.url;

    const ranked = series.filter((rank) => rank != null);
    const best = Math.min(...ranked);
    const first = series.findIndex((rank) => rank != null);
    const stats = [
        [`Le ${shortDate(state.date)}`, series[index] ? ordinal(series[index]) : 'Hors du top', ''],
        ['Meilleur rang', ordinal(best), `atteint le ${shortDate(dates[series.indexOf(best)])}`],
        ['Entrée dans le top', shortDate(dates[first]), `à la ${ordinal(series[first]).replace('1er', '1re')} place`],
        ['Présence', plural(ranked.length, 'relevé'), `sur ${dates.length}`],
    ];
    $('panel-stats').replaceChildren(...stats.map(([term, value, detail]) => {
        const group = document.createElement('div');
        const dt = document.createElement('dt');
        dt.textContent = term;
        const dd = document.createElement('dd');
        dd.textContent = value;
        if (detail) {
            const small = document.createElement('small');
            small.textContent = detail;
            dd.append(small);
        }
        group.append(dt, dd);
        return group;
    }));

    $('chart-caption').textContent = `Rang dans « ${ranking.label} » au fil du temps`;
    drawChart(dates, index, series);
    el.chart.setAttribute('aria-label',
        `Rang de ${movie.title} du ${longDate(dates[0])} au ${longDate(dates.at(-1))} : meilleur rang ${ordinal(best)}, présent dans ${plural(ranked.length, 'relevé')} sur ${dates.length}. Flèches gauche et droite pour changer de date.`);
}

// Rank over time: one line, rank 1 at the top, broken where the film left the top.
function drawChart(dates, index, series) {
    const W = 440, H = 240, left = 34, right = 14, top = 14, bottom = 26;
    const start = toDay(dates[0]);
    const span = toDay(dates.at(-1)) - start;
    const x = (k) => (span ? left + ((toDay(dates[k]) - start) / span) * (W - left - right) : W / 2);
    const worst = Math.max(...series.filter((rank) => rank != null));
    const yMax = [10, 20, 50, 100].find((v) => v >= worst) || worst;
    const y = (rank) => top + ((rank - 1) / (yMax - 1)) * (H - top - bottom);

    let svg = '';
    for (const rank of [1, yMax / 2, yMax]) {
        svg += `<line class="grid" x1="${left}" x2="${W - right}" y1="${y(rank)}" y2="${y(rank)}"/>`;
        svg += `<text class="axis" x="${left - 8}" y="${y(rank) + 4}" text-anchor="end">${rank}</text>`;
    }
    let lastYear, lastX = -Infinity;
    dates.forEach((d, k) => {
        const year = d.slice(0, 4);
        if (year === lastYear) return;
        lastYear = year;
        if (x(k) - lastX < 44 || x(k) > W - right - 24) return;
        lastX = x(k);
        svg += `<text class="axis" x="${x(k)}" y="${H - 6}">${year}</text>`;
    });

    let segment = [];
    const flush = () => {
        if (segment.length === 1) svg += `<circle class="lone" cx="${segment[0][0]}" cy="${segment[0][1]}" r="2.5"/>`;
        else if (segment.length) svg += `<path class="line" d="M${segment.map((p) => p.join(',')).join('L')}"/>`;
        segment = [];
    };
    series.forEach((rank, k) => (rank == null ? flush() : segment.push([x(k).toFixed(1), y(rank).toFixed(1)])));
    flush();

    svg += `<line class="hair" x1="${x(index)}" x2="${x(index)}" y1="${top}" y2="${H - bottom}"/>`;
    if (series[index] != null) svg += `<circle class="marker" cx="${x(index)}" cy="${y(series[index])}" r="5"/>`;
    svg += `<line class="hair hover-line" y1="${top}" y2="${H - bottom}" visibility="hidden"/>`;
    svg += `<circle class="hover" r="4.5" visibility="hidden"/>`;
    el.chart.innerHTML = svg; // numbers only, no text from the data
    el.tip.hidden = true;
    chart = { dates, index, series, x, y, W, top };
}

function chartIndexAt(event) {
    const box = el.chart.getBoundingClientRect();
    const target = ((event.clientX - box.left) / box.width) * chart.W;
    let nearest = 0;
    chart.series.forEach((_, k) => {
        if (Math.abs(chart.x(k) - target) < Math.abs(chart.x(nearest) - target)) nearest = k;
    });
    return nearest;
}

el.chart.addEventListener('pointermove', (event) => {
    const k = chartIndexAt(event);
    const rank = chart.series[k];
    const box = el.chart.getBoundingClientRect();
    const scale = box.width / chart.W;
    const dot = el.chart.querySelector('.hover');
    const line = el.chart.querySelector('.hover-line');
    line.setAttribute('x1', chart.x(k));
    line.setAttribute('x2', chart.x(k));
    line.setAttribute('visibility', 'visible');
    dot.setAttribute('visibility', rank == null ? 'hidden' : 'visible');
    if (rank != null) { dot.setAttribute('cx', chart.x(k)); dot.setAttribute('cy', chart.y(rank)); }

    const value = document.createElement('strong');
    value.textContent = rank == null ? 'Hors du top' : ordinal(rank);
    el.tip.replaceChildren(value, shortDate(chart.dates[k]));
    el.tip.hidden = false;
    el.tip.style.left = `${Math.max(60, Math.min(box.width - 60, chart.x(k) * scale))}px`;
    el.tip.style.top = `${(rank == null ? chart.top + 40 : chart.y(rank)) * scale}px`;
});
el.chart.addEventListener('pointerleave', () => {
    el.tip.hidden = true;
    for (const mark of el.chart.querySelectorAll('.hover, .hover-line')) mark.setAttribute('visibility', 'hidden');
});
el.chart.addEventListener('click', (event) => setDate(chart.dates[chartIndexAt(event)]));
el.chart.addEventListener('keydown', (event) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const date = chart.dates[chart.index + step];
    if (date) setDate(date);
});

el.panel.addEventListener('close', () => { state.openId = null; });

// Closing by clicking the backdrop, for browsers without <dialog closedby>.
if (!('closedBy' in HTMLDialogElement.prototype)) {
    el.panel.addEventListener('click', (event) => {
        if (event.target !== el.panel) return;
        const box = el.panel.getBoundingClientRect();
        const inside = box.top <= event.clientY && event.clientY <= box.bottom
            && box.left <= event.clientX && event.clientX <= box.right;
        if (!inside) el.panel.close();
    });
}

init();
