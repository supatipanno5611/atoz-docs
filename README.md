# atoz-docs

Obsidian 플러그인 [atoz](https://github.com/supatipanno5611/atoz)의 기능 문서 사이트입니다.

## 구조

- `content/`: 문서 원본. 파일 이름은 `feature-번호-이름.md` 형식이고, 번호 순서대로 홈 목록과 이전/다음 링크가 만들어집니다.
- `content/index.md`: 홈. `section="feature"` 줄 자리에 문서 목록이 들어갑니다.
- `layout/`, `static/`: 페이지 틀과 스타일, 스크립트.
- `build.js`: `content/`를 `public/`의 HTML로 변환합니다.

문서 맨 위 frontmatter의 `title`이 페이지 제목(h1)이 되므로 본문은 `##`부터 씁니다. 헤딩은 `####`까지, 단계를 건너뛰지 않아야 빌드됩니다.

## 빌드

```bash
npm install
npm run build
```

Vercel이 main에 푸시될 때마다 같은 명령으로 빌드해 배포합니다.

## 릴리스

atoz의 `npm run release`가 이 리포(`../atoz-docs`)도 확인합니다. 커밋하지 않은 변경이 없어야 하고, 플러그인과 같은 버전 태그를 이 리포에도 붙여 푸시합니다.
