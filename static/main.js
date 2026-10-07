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

    // 2. 요소 확인: 헤딩 링크, 일반 링크 구분
    const headingLink = target.closest('h1 a, h2 a, h3 a, h4 a');
    const normalLink = target.closest('a');
    
    // 문단 내부에 있는 일반 링크를 클릭했을 경우, 링크 본연의 기능이 작동하도록 빠져나감
    if (normalLink && !headingLink) {
        return;
    }

    // 3. 요소 확인: ID가 부여된 문단(<p>)
    const paragraph = target.closest('p[id]');

    // 헤딩 링크도 아니고 ID가 있는 문단도 아니라면 무시
    if (!headingLink && !paragraph) return;

    let hash = '';
    let flashTarget = null;

    // 헤딩 링크를 클릭한 경우
    if (headingLink) {
        e.preventDefault();
        hash = headingLink.getAttribute('href');
        flashTarget = headingLink.parentElement; // h1~h4
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
    // 본문에 $ 기호가 없으면 KaTeX를 불러올 필요 없음
    if (!document.querySelector('main').textContent.includes('$')) return;

    loadKatex().then(() => {
        renderMathInElement(document.querySelector('main'), {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false }
            ]
        });
    }).catch(err => {
        console.error('KaTeX 로드 실패:', err);
    });
});