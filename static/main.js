function flashElement(el) {
    if (!el) return;
    el.classList.remove('copied-flash');
    // 리플로우를 강제해 애니메이션이 재시작되도록 함
    void el.offsetWidth;
    el.classList.add('copied-flash');
    el.addEventListener('animationend', () => {
        el.classList.remove('copied-flash');
    }, { once: true });
}

document.addEventListener('click', (e) => {
    // 1. 사용자가 텍스트를 드래그(블록 지정) 중인지 확인
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
        return; // 드래그 중이라면 아무런 동작도 하지 않고 종료
    }

    const target = e.target;

    // 2. 요소 확인: 본문 헤딩 링크, 일반 링크 구분
    const headingLink = target.closest('.doc-body h2 > a, .doc-body h3 > a, .doc-body h4 > a');
    const normalLink = target.closest('a');

    // 문단 내부에 있는 일반 링크를 클릭했을 경우, 링크 본연의 기능이 작동하도록 빠져나감
    if (normalLink && !headingLink) {
        return;
    }

    // 3. 요소 확인: ID가 부여된 문단(<p>)
    const paragraph = target.closest('.doc-body p[id]');

    // 헤딩 링크도 아니고 ID가 있는 문단도 아니라면 무시
    if (!headingLink && !paragraph) return;

    let hash = '';
    let flashTarget = null;

    // 헤딩 링크를 클릭한 경우
    if (headingLink) {
        e.preventDefault();
        hash = headingLink.getAttribute('href');
        flashTarget = headingLink.parentElement; // h2~h4
    }
    // 문단을 클릭한 경우
    else if (paragraph) {
        hash = '#' + paragraph.getAttribute('id');
        flashTarget = paragraph;
    }

    if (!hash) return;

    // URL 조립 및 클립보드 복사
    const url = location.origin + location.pathname + hash;
    navigator.clipboard.writeText(url).catch(err => {
        console.error('클립보드 복사 실패:', err);
    });

    // 주소창 업데이트 (페이지가 새로고침되거나 튀는 현상 방지)
    history.pushState(null, '', hash);

    // 복사된 요소에 배경색 하이라이트 효과 적용 후 원복
    flashElement(flashTarget);
});

// 해시로 페이지에 진입하거나 해시가 변경된 경우, 대상 요소에 하이라이트 적용
function flashByHash() {
    const hash = location.hash;
    if (!hash) return;
    const target = document.getElementById(decodeURIComponent(hash.slice(1)));
    flashElement(target);
}

window.addEventListener('DOMContentLoaded', flashByHash);
window.addEventListener('hashchange', flashByHash);

// ==========================================
// 모바일 사이드바 서랍
// ==========================================
const site = document.querySelector('.site');
const menuButton = document.querySelector('.menu-button');
const scrim = document.querySelector('.scrim');
const drawerQuery = window.matchMedia('(max-width: 899px)');

function setNavOpen(open) {
    site.classList.toggle('nav-open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    scrim.hidden = !open;
}

menuButton.addEventListener('click', () => {
    setNavOpen(!site.classList.contains('nav-open'));
});

scrim.addEventListener('click', () => setNavOpen(false));

drawerQuery.addEventListener('change', () => setNavOpen(false));

// ==========================================
// 이 페이지 목차: 좁은 화면에서는 접어 두고, 읽는 위치를 표시
// ==========================================
const pageToc = document.querySelector('.page-toc');

if (pageToc) {
    const wideQuery = window.matchMedia('(min-width: 1280px)');
    const syncTocOpen = () => { pageToc.open = wideQuery.matches; };
    syncTocOpen();
    wideQuery.addEventListener('change', syncTocOpen);

    const tocLinks = new Map();
    pageToc.querySelectorAll('a').forEach(link => {
        const target = document.getElementById(decodeURIComponent(link.hash.slice(1)));
        if (target) tocLinks.set(target, link);
    });

    // 헤딩이 화면 위쪽 4분의 1 선을 넘나들 때만 다시 계산한다.
    // 그 선을 지나간 마지막 헤딩이 지금 읽는 구역이다.
    const markActive = () => {
        const line = window.innerHeight * 0.25;
        let current = tocLinks.values().next().value;
        tocLinks.forEach((link, heading) => {
            if (heading.getBoundingClientRect().top <= line) current = link;
        });
        tocLinks.forEach(link => link.classList.toggle('is-active', link === current));
    };

    const observer = new IntersectionObserver(markActive, { rootMargin: '0px 0px -75% 0px' });
    tocLinks.forEach((link, heading) => observer.observe(heading));
    pageToc.addEventListener('click', e => {
        if (e.target.closest('a') && !wideQuery.matches) pageToc.open = false;
    });
}

// ==========================================
// 검색: 빌드 때 만든 search-index.json을 처음 쓸 때 불러온다
// ==========================================
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const sidebarNav = document.querySelector('.sidebar-nav');
let searchIndex = null;
let searchIndexPromise = null;
let selectedResult = -1;

function loadSearchIndex() {
    if (!searchIndexPromise) {
        searchIndexPromise = fetch('/search-index.json')
            .then(res => {
                if (!res.ok) throw new Error(res.status);
                return res.json();
            })
            .then(data => {
                searchIndex = data.map(entry => ({
                    ...entry,
                    lowerPage: entry.page.toLowerCase(),
                    lowerHeading: entry.heading.toLowerCase(),
                    lowerDescription: entry.description.toLowerCase(),
                    lowerText: entry.text.toLowerCase(),
                }));
            })
            .catch(err => {
                searchIndexPromise = null;
                throw err;
            });
    }
    return searchIndexPromise;
}

function search(query) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    const results = [];
    searchIndex.forEach(entry => {
        let score = 0;
        for (const term of terms) {
            let termScore = 0;
            if (entry.lowerPage.includes(term)) termScore += 10;
            if (entry.lowerHeading.includes(term)) termScore += 6;
            if (entry.lowerDescription.includes(term)) termScore += 4;
            if (entry.lowerText.includes(term)) termScore += 1;
            if (termScore === 0) return; // 모든 검색어가 들어 있어야 결과로 본다
            score += termScore;
        }
        results.push({ entry, score });
    });

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 12).map(r => r.entry);
}

// 첫 번째 일치 지점 주변을 잘라 보여 준다
function snippetFor(text, terms) {
    const lower = text.toLowerCase();
    let index = -1;
    for (const term of terms) {
        index = lower.indexOf(term);
        if (index !== -1) break;
    }
    if (index === -1) return text.slice(0, 90);
    const start = Math.max(0, index - 30);
    return (start > 0 ? '…' : '') + text.slice(start, start + 110);
}

function appendHighlighted(parent, text, terms) {
    const pattern = terms
        .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
    if (!pattern) {
        parent.append(text);
        return;
    }
    text.split(new RegExp(`(${pattern})`, 'gi')).forEach((part, i) => {
        if (i % 2 === 1) {
            const mark = document.createElement('mark');
            mark.textContent = part;
            parent.append(mark);
        } else if (part) {
            parent.append(part);
        }
    });
}

function renderResults(query) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const results = search(query);
    searchResults.replaceChildren();
    selectedResult = -1;

    if (results.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'search-empty';
        empty.textContent = `'${query}'와 일치하는 내용이 없습니다.`;
        searchResults.append(empty);
        return;
    }

    results.forEach((entry, i) => {
        const link = document.createElement('a');
        link.className = 'search-result';
        link.href = entry.url;
        link.id = `search-result-${i}`;
        link.setAttribute('role', 'option');

        const pathEl = document.createElement('span');
        pathEl.className = 'search-result-path';
        appendHighlighted(pathEl, entry.heading ? `${entry.page} › ${entry.heading}` : entry.page, terms);

        const snippetEl = document.createElement('span');
        snippetEl.className = 'search-result-snippet';
        appendHighlighted(snippetEl, snippetFor(entry.text || entry.description, terms), terms);

        link.append(pathEl, snippetEl);
        searchResults.append(link);
    });
}

function selectResult(index) {
    const links = searchResults.querySelectorAll('.search-result');
    if (links.length === 0) return;
    selectedResult = (index + links.length) % links.length;
    links.forEach((link, i) => link.setAttribute('aria-selected', String(i === selectedResult)));
    links[selectedResult].scrollIntoView({ block: 'nearest' });
    searchInput.setAttribute('aria-activedescendant', links[selectedResult].id);
}

function updateSearch() {
    const query = searchInput.value.trim();
    const active = query.length > 0;
    searchResults.hidden = !active;
    sidebarNav.hidden = active;
    searchInput.removeAttribute('aria-activedescendant');
    if (!active) return;

    loadSearchIndex()
        .then(() => {
            if (searchInput.value.trim() === query) renderResults(query);
        })
        .catch(() => {
            const error = document.createElement('p');
            error.className = 'search-empty';
            error.textContent = '검색 목록을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
            searchResults.replaceChildren(error);
        });
}

searchInput.addEventListener('focus', () => { loadSearchIndex().catch(() => {}); });
searchInput.addEventListener('input', updateSearch);

searchInput.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectResult(selectedResult + 1);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectResult(selectedResult - 1);
    } else if (e.key === 'Enter') {
        const links = searchResults.querySelectorAll('.search-result');
        const link = links[Math.max(0, selectedResult)];
        if (link) {
            e.preventDefault();
            link.click();
        }
    } else if (e.key === 'Escape') {
        searchInput.value = '';
        updateSearch();
        searchInput.blur();
    }
});

// 같은 페이지 안의 결과를 고르면 해시만 바뀌므로 검색을 닫아 준다
searchResults.addEventListener('click', e => {
    if (!e.target.closest('.search-result')) return;
    searchInput.value = '';
    updateSearch();
    setNavOpen(false);
});

// '/' 또는 Ctrl+K로 검색창에 바로 들어간다
document.addEventListener('keydown', e => {
    const typing = e.target.closest('input, textarea, [contenteditable="true"]');
    const slash = e.key === '/' && !typing;
    const ctrlK = e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey);
    if (!slash && !ctrlK) return;
    e.preventDefault();
    if (drawerQuery.matches) setNavOpen(true);
    searchInput.focus();
    searchInput.select();
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && site.classList.contains('nav-open')) {
        setNavOpen(false);
        menuButton.focus();
    }
});

// ==========================================
// KaTeX: $...$, $$...$$ 수식 렌더링
// ==========================================
function loadKatex() {
    return new Promise((resolve, reject) => {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
        document.head.appendChild(css);

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js';
        script.onload = () => {
            const autoRender = document.createElement('script');
            autoRender.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js';
            autoRender.onload = resolve;
            autoRender.onerror = reject;
            document.head.appendChild(autoRender);
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const body = document.querySelector('.doc-body');
    // 본문에 $ 기호가 없으면 KaTeX를 불러올 필요 없음
    if (!body || !body.textContent.includes('$')) return;

    loadKatex().then(() => {
        renderMathInElement(body, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false }
            ]
        });
    }).catch(err => {
        console.error('KaTeX 로드 실패:', err);
    });
});
