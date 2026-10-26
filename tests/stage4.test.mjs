import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

const frontend = "agent/frontend/";
const pages = frontend + "src/pages/";
const sourceFiles = [
  frontend + "src/App.tsx",
  frontend + "src/api.ts",
  ...readdirSync(pages)
    .map((name) => pages + name)
    .filter((path) => statSync(path).isFile()),
  ...readdirSync(pages + "settings").map((name) => pages + "settings/" + name),
];
const source = sourceFiles.map((path) => readFileSync(path, "utf8")).join("\n");

test("단계 4 앱과 테스트가 존재한다", () => {
  for (const path of [
    "src/App.tsx",
    "src/main.tsx",
    "src/api.ts",
    "src/App.test.tsx",
    "vite.config.ts",
    "index.html",
  ]) {
    assert.equal(existsSync(frontend + path), true, path);
  }
});

test("최상위 메뉴는 여덟 경로를 제공하고 읽기 권한으로 노출과 접근을 제한한다", () => {
  const app = readFileSync(frontend + "src/App.tsx", "utf8");
  const navigation = app
    .split("const navigation: NavigationItem[] = [")[1]
    ?.split("const settingsItems = [")[0];
  assert.ok(navigation, "top-level navigation is defined");
  const entries = [
    ...navigation.matchAll(/label:\s*'([^']+)',\s*to:\s*'([^']+)'/g),
  ].map(([, label, path]) => [label, path]);
  assert.deepEqual(entries, [
    ["종합 현황", "/"],
    ["장애 관리", "/incidents"],
    ["프로젝트", "/projects"],
    ["API 모니터링", "/api-monitoring"],
    ["XLog", "/xlog"],
    ["실시간 로그", "/logs"],
    ["인증서 관리", "/certificates"],
    ["설정", "/settings/projects"],
  ]);
  assert.match(app, /\.filter\(\(item\) => isAdmin \|\| item\.canRead\)/);
  assert.match(
    app,
    /!isAdmin && !menus\?\.find\(\(menu\) => menu\.menuId === menuForPath\(pathname\)\)\?\.canRead/,
  );
  assert.match(app, /이 화면에 접근할 권한이 없습니다\./);
});

test("인스턴스 상세는 AntD 공통 다섯 탭과 쓰기 권한 탭 두 개, 미지원 표기를 제공한다", () => {
  const detail = readFileSync(
    frontend + "src/pages/InstanceDetailPage.tsx",
    "utf8",
  );
  assert.match(detail, /import \{[^}]*\bTabs\b[^}]*\} from 'antd'/);
  assert.match(detail, /<Tabs\s+activeKey=\{current\}/);
  assert.match(detail, /onChange=\{\(key\) => setSearch\(\{ tab: key \}\)\}/);
  const items = detail.split("items={[")[1]?.split("]}")[0];
  assert.ok(items, "AntD tab items are defined");
  const [common, writable] = items.split("...(canWrite");
  assert.ok(writable, "write-only tabs are gated");
  const tabs = (part) =>
    [...part.matchAll(/key:\s*'([^']+)',\s*label:\s*'([^']+)'/g)].map(
      ([, key, label]) => [key, label],
    );
  assert.deepEqual(tabs(common), [
    ["resources", "JVM·서버 자원"],
    ["thresholds", "임계치 관리"],
    ["db-pools", "DB Pool"],
    ["internal-checks", "내부 점검"],
    ["xlog", "XLog"],
  ]);
  assert.deepEqual(tabs(writable), [
    ["log-history", "저장된 로그"],
    ["logs", "실시간 로그"],
  ]);
  assert.match(writable, /:\s*\[\]/);
  assert.match(detail, /DB Pool 수집이 지원되지 않습니다\./);
  assert.match(detail, /:\s*'미지원'/);
});

test("실 API polling, 토큰 비재표시, lazy routes가 구현된다", () => {
  assert.match(source, /refetchInterval:\s*15_000/);
  assert.ok(!source.includes("token_ciphertext"));
  assert.ok(!source.includes("fixtures/"));
  assert.match(
    readFileSync(frontend + "src/App.tsx", "utf8"),
    /lazy\(\(\) => import/,
  );
});

test("primary content uses the full workspace width and allows grid children to shrink", () => {
  const app = readFileSync(frontend + "src/App.tsx", "utf8");
  const css = readFileSync(frontend + "src/app.css", "utf8");
  const layout = readFileSync(frontend + "src/pro-layout.css", "utf8");
  assert.match(app, /<ProLayout[\s\S]*?contentWidth="Fluid"/);
  assert.match(
    cssRule(layout, ".monitor-pro-layout .ant-pro-layout-content"),
    /min-width:\s*0/,
  );
  assert.match(
    cssRule(css, ".chart-grid,\n.service-balance-grid"),
    /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    cssRule(
      css,
      ".chart-grid > *,\n.service-balance-grid > *,\n.metric-chart-card",
    ),
    /min-width:\s*0/,
  );
  assert.match(
    cssRule(css, ".resource-overflow,\n.project-overview-scroll"),
    /min-width:\s*0;\s*overflow-x:\s*auto/,
  );
  assert.doesNotMatch(app + css + layout, /\.app-shell|\.side-rail|\.topbar/);
  assert.doesNotMatch(
    css + layout,
    /(?:html|body|#root|\.workspace)\s*\{[^}]*background\s*:/,
  );
  assert.doesNotMatch(
    cssRule(layout, ".monitor-pro-layout .ant-pro-layout-content"),
    /max-width\s*:/,
  );
});

function cssRule(css, selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `missing CSS rule for ${selector}`);
  return css.slice(start, css.indexOf("}", start) + 1);
}
