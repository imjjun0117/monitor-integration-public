import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 차트 표시의 TailAdmin 계보를 배포물에서도 고지한다.
const output = resolve('public/assets');
mkdirSync(output, { recursive: true });
copyFileSync(resolve('THIRD_PARTY_NOTICES.md'), resolve(output, 'THIRD_PARTY_NOTICES.txt'));

// 기존 브랜드 글꼴과 라이선스를 같은 서버에서 제공
const fonts = resolve(output, 'fonts');
mkdirSync(fonts, { recursive: true });
const styles = [];
for (const name of ['outfit', 'noto-sans-kr']) {
  const source = resolve(`node_modules/@fontsource-variable/${name}`);
  const css = readFileSync(resolve(source, 'wght.css'), 'utf8');
  for (const match of css.matchAll(/url\(\.\/(files\/[^)]+)\)/g)) {
    copyFileSync(resolve(source, match[1]), resolve(fonts, match[1].replace('files/', '')));
  }
  styles.push(css.replaceAll('./files/', './'));
  copyFileSync(resolve(source, 'LICENSE'), resolve(fonts, `${name}-LICENSE.txt`));
}
writeFileSync(resolve(fonts, 'fonts.css'), styles.join('\n'));
