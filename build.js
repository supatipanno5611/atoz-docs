const fs = require('fs/promises');
const { existsSync } = require('fs');
const path = require('path');
const crypto = require('crypto');
const matter = require('gray-matter');
const { marked } = require('marked');

// 설정 파일 불러오기
const config = require('./config.json');

// 사이트 전역 상수
const SITE_URL = 'https://atoz-docs.vercel.app';

// ---------------------------------------------------------
// 1. 디렉토리 경로 설정 (config.json 기반)
// ---------------------------------------------------------
const PATHS = {
    CONTENT: path.join(__dirname, config.paths.content),
    LAYOUTS: path.join(__dirname, config.paths.layout),
    STATIC: path.join(__dirname, config.paths.static),
    PUBLIC: path.join(__dirname, config.paths.public),
};

// ---------------------------------------------------------
// 2. 헬퍼 함수: 수식($...$, $$...$$) 보호/복원
// ---------------------------------------------------------
// marked가 수식 내부의 _, * 등을 마크다운 문법으로 잘못 해석하지 않도록,
// 파싱 전에 플레이스홀더로 치환해두었다가 HTML 변환 후 원래 수식으로 복원한다.
function protectMath(content) {
    const mathBlocks = [];

    const protectedContent = content.replace(
        /\$\$[\s\S]+?\$\$|\$[^\n$]+?\$/g,
        (match) => {
            const index = mathBlocks.length;
            mathBlocks.push(match);
            return `%%MATH${index}%%`;
        }
    );

    return { protectedContent, mathBlocks };
}

function restoreMath(html, mathBlocks) {
    return html.replace(/%%MATH(\d+)%%/g, (match, index) => mathBlocks[Number(index)]);
}

// ---------------------------------------------------------
// 3. 헬퍼 함수: Marked 렌더러 설정
// ---------------------------------------------------------
function getCustomRenderer(filename, headings) {
    const renderer = new marked.Renderer();
    const stack = [];
    
    // 문단 ID 부여를 위한 상태 추적 변수
    let currentParentId = '';
    let paragraphCount = 0;

    renderer.heading = (text, level, raw) => {
        const slug = raw.replace(/\s+/g, '-');

        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
            stack.pop();
        }

        const parent = stack[stack.length - 1];
        if (level > 4) {
            throw new Error(`[${filename}] 헤딩 위계 오류: "${text}" (h${level})는 h4까지만 지원합니다.`);
        }
        if (parent && level - parent.level > 1) {
            throw new Error(`[${filename}] 헤딩 위계 오류: "${text}" (h${level})가 h${parent.level} 다음에 레벨을 건너뛰고 나왔습니다.`);
        }
        if (!parent && level > 2) {
            throw new Error(`[${filename}] 헤딩 위계 오류: "${text}" (h${level}) 앞에 상위 헤딩이 없습니다.`);
        }

        const id = parent ? `${parent.id}>${slug}` : slug;
        stack.push({ level, id });

        headings.push({ level, id, text });

        // 헤딩이 바뀔 때마다 부모 ID를 갱신하고 문단 카운터를 리셋
        currentParentId = id;
        paragraphCount = 0;

        return `<h${level} id="${id}"><a href="#${id}">${text}</a></h${level}>\n`;
    };
    
	renderer.link = (href, title, text) => {
	    // 상대경로 .md 링크만 처리 (외부 링크, 앵커, 이미 확장자 없는 링크는 그대로)
	    if (href && !/^https?:\/\//.test(href) && href.endsWith('.md')) {
	        href = href.replace(/\.md$/, '');
	    }
	    const titleAttr = title ? ` title="${title}"` : '';
	    return `<a href="${href}"${titleAttr}>${text}</a>`;
	};

    renderer.paragraph = (text) => {
        // 방어 로직: TOC 플레이스홀더는 카운트하지 않고 ID 없이 반환 (정규식 치환을 위함)
        if (text.trim() === '%%TOC%%') {
            return `<p>%%TOC%%</p>\n`;
        }

        paragraphCount++;
        const pId = currentParentId ? `${currentParentId}>p${paragraphCount}` : `p${paragraphCount}`;
        return `<p id="${pId}">${text}</p>\n`;
    };

    return renderer;
}

// ---------------------------------------------------------
// 4. 메인 기능 함수들
// ---------------------------------------------------------

async function preparePublicDirectory() {
    if (existsSync(PATHS.PUBLIC)) {
        await fs.rm(PATHS.PUBLIC, { recursive: true, force: true });
    }
    await fs.mkdir(PATHS.PUBLIC);

    const staticFileMap = {};

    if (existsSync(PATHS.STATIC)) {
        const staticFiles = await fs.readdir(PATHS.STATIC);
        await Promise.all(staticFiles.map(async file => {
            const filePath = path.join(PATHS.STATIC, file);
            const content = await fs.readFile(filePath);

            if (config.independentHtml.includes(file)) {
                await fs.writeFile(path.join(PATHS.PUBLIC, file), content);
                return;
            }

            const hash = crypto.createHash('md5').update(content).digest('hex').slice(0, 6);
            const ext = path.extname(file);
            const base = path.basename(file, ext);
            const hashedFile = `${base}.${hash}${ext}`;

            staticFileMap[file] = hashedFile;
            await fs.writeFile(path.join(PATHS.PUBLIC, hashedFile), content);
        }));
    }

    return staticFileMap;
}

function parseCategoryFromFilename(filename) {
    const match = filename.match(/^([^-]+)-(\d+)-/);
    if (!match) {
        throw new Error(`파일명 규칙 위반: "${filename}" (예: category-1-title.md 형식이어야 합니다.)`);
    }
    return { category: match[1], order: parseInt(match[2], 10) };
}

function renderCategoryList(items) {
    const listItems = items.map(item => {
        const descHtml = item.description
            ? `<ul><li>${item.description}</li></ul>`
            : '';
        return `<li><a href="/${item.slug}">${item.title}</a>${descHtml}</li>`;
    });
    return `<ul>\n${listItems.join('\n')}\n</ul>`;
}

function renderPrevNext(categoryItems, currentSlug) {
    if (!categoryItems) return '';

    const index = categoryItems.findIndex(item => item.slug === currentSlug);
    if (index === -1) return '';

    const prev = index > 0 ? categoryItems[index - 1] : null;
    const next = index < categoryItems.length - 1 ? categoryItems[index + 1] : null;

    if (!prev && !next) return '';

    const prevHtml = prev ? `<a href="/${prev.slug}">← ${prev.title}</a>` : '<span></span>';
    const nextHtml = next ? `<a href="/${next.slug}">${next.title} →</a>` : '<span></span>';

    return `<nav class="prev-next">${prevHtml}${nextHtml}</nav>`;
}

function buildToc(headings) {
    if (headings.length === 0) return '';

    let html = '';
    let prevLevel = null;

    headings.forEach(h => {
        if (prevLevel === null) {
            html += `<li><a href="#${h.id}">${h.text}</a>`;
        } else if (h.level > prevLevel) {
            html += `<ul><li><a href="#${h.id}">${h.text}</a>`;
        } else if (h.level === prevLevel) {
            html += `</li><li><a href="#${h.id}">${h.text}</a>`;
        } else {
            for (let l = prevLevel; l > h.level; l--) {
                html += '</li></ul>';
            }
            html += `</li><li><a href="#${h.id}">${h.text}</a>`;
        }
        prevLevel = h.level;
    });

    for (let l = prevLevel; l > 2; l--) {
        html += '</li></ul>';
    }
    html += '</li>';

    return `<ul>${html}</ul>`;
}

function slugToUrl(slug) {
    return slug === 'index' ? `${SITE_URL}/` : `${SITE_URL}/${slug}`;
}

async function generateSitemap(filesData) {
    const urls = filesData
        .map(({ slug, data }) => {
            const lastmod = data.date ? `\n    <lastmod>${new Date(data.date).toISOString().split('T')[0]}</lastmod>` : '';
            return `  <url>
    <loc>${slugToUrl(slug)}</loc>${lastmod}
  </url>`;
        })
        .join('\n');

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    await fs.writeFile(path.join(PATHS.PUBLIC, 'sitemap.xml'), sitemap);
    console.log('✅ 사이트맵 생성 완료: sitemap.xml');
}

async function processMarkdownFiles(staticFileMap) {
    if (!existsSync(PATHS.CONTENT)) return;

    const layoutHtml = await fs.readFile(path.join(PATHS.LAYOUTS, 'default.html'), 'utf-8');
    const layoutWithStaticRefs = Object.entries(staticFileMap).reduce(
    	(html, [original, hashed]) => html.replaceAll(original, hashed),
    	layoutHtml
    );
    
    const allFiles = await fs.readdir(PATHS.CONTENT);
    const mdFiles = allFiles.filter(file => file.endsWith('.md'));

    const categories = {};
    const filesData = [];

    // 1단계: 마크다운 파일을 한 번만 읽어 데이터 수집 및 카테고리 분류
    await Promise.all(mdFiles.map(async file => {
        const filePath = path.join(PATHS.CONTENT, file);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const { data, content } = matter(fileContent);
        const slug = file.replace(/\.md$/, '');

        // config.json의 예외 파일 목록에 없는 경우에만 파일명 규칙 검사 수행
        if (!config.exceptionFiles.includes(file)) {
            const parsed = parseCategoryFromFilename(file);

            if (!categories[parsed.category]) categories[parsed.category] = [];
            categories[parsed.category].push({
                order: parsed.order,
                slug,
                title: data.title || '제목 없음',
                description: data.description || '',
            });
        }

        // HTML 렌더링을 위해 메모리에 저장
        filesData.push({ file, slug, data, content });
    }));

    // 카테고리 내 문서들을 order 기준으로 정렬
    Object.values(categories).forEach(list => list.sort((a, b) => a.order - b.order));

    // slug -> 소속 카테고리 목록 매핑 (prev/next 조회용)
    const slugToCategoryItems = {};
    Object.values(categories).forEach(list => {
        list.forEach(item => {
            slugToCategoryItems[item.slug] = list;
        });
    });

    // 2단계: 수집된 메모리 데이터를 바탕으로 HTML 변환 및 파일 저장 병렬 처리
    await Promise.all(filesData.map(async ({ file, slug, data, content }) => {
        const headings = [];
        const renderer = getCustomRenderer(file, headings);

        const contentWithVideo = content.replace(
            /^yt="([^"]+)"$/gm,
            '<div class="video-container"><iframe src="https://www.youtube.com/embed/$1?rel=0" loading="lazy" referrerpolicy="origin" allow="picture-in-picture" allowfullscreen></iframe></div>'
        );

        const contentWithSections = contentWithVideo.replace(
            /^section="([^"]+)"$/gm,
            (match, category) => {
                const items = categories[category];
                return items ? renderCategoryList(items) : '';
            }
        );

        const contentWithTocPlaceholder = contentWithSections.replace(/\{\{\s*toc\s*\}\}/g, '%%TOC%%');

        const { protectedContent, mathBlocks } = protectMath(contentWithTocPlaceholder);

        let htmlContent = marked.parse(protectedContent, { breaks: true, renderer });

        htmlContent = restoreMath(htmlContent, mathBlocks);

        if (contentWithTocPlaceholder.includes('%%TOC%%')) {
                const tocHtml = buildToc(headings);
                const replaced = htmlContent.replace(/<p>%%TOC%%<\/p>/g, tocHtml);
                if (replaced === htmlContent) {
                        throw new Error(`[${file}] {{ toc }}가 단독 줄에 있지 않아 치환하지 못했습니다.`);
                }
                htmlContent = replaced;
        }

        const prevNextHtml = renderPrevNext(slugToCategoryItems[slug], slug);

        let finalHtml = layoutWithStaticRefs
                .replace(/\{\{\s*title\s*\}\}/g, data.title || '제목 없음')
                .replace(/\{\{\s*description\s*\}\}/g, data.description || '')
                .replace(/\{\{\s*content\s*\}\}/g, htmlContent)
                .replace(/\{\{\s*prev_next\s*\}\}/g, prevNextHtml);
            
            Object.entries(staticFileMap).forEach(([original, hashed]) => {
            	finalHtml = finalHtml.replaceAll(original, hashed);
            });

        const outputFilename = `${slug}.html`;
        await fs.writeFile(path.join(PATHS.PUBLIC, outputFilename), finalHtml);

        console.log(`✅ MD 생성 완료: ${outputFilename}`);
    }));

    await generateSitemap(filesData);
}

// ---------------------------------------------------------
// 5. 빌드 실행 (메인 로직)
// ---------------------------------------------------------
async function buildSite() {
    try {
        console.log('⏳ 빌드를 시작합니다...');
        const staticFileMap = await preparePublicDirectory();
        await processMarkdownFiles(staticFileMap);
        console.log('🚀 빌드 성공!');
    } catch (error) {
        console.error('\n🚨 빌드 중 치명적인 오류가 발생하여 중단되었습니다.');
        console.error(`❌ ${error.message}\n`);
        process.exit(1);
    }
}

// 스크립트 실행
buildSite();