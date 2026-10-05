import { readFileSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const output = resolve('public/assets/fonts');
mkdirSync(output, { recursive: true });
const styles = [];
for (const name of ['outfit', 'noto-sans-kr']) {
  const source = resolve(`node_modules/@fontsource-variable/${name}`);
  const css = readFileSync(resolve(source, 'wght.css'), 'utf8');
  for (const match of css.matchAll(/url\(\.\/(files\/[^)]+)\)/g)) {
    copyFileSync(resolve(source, match[1]), resolve(output, match[1].replace('files/', '')));
  }
  styles.push(css.replaceAll('./files/', './'));
  copyFileSync(resolve(source, 'LICENSE'), resolve(output, `${name}-LICENSE.txt`));
}
writeFileSync(resolve(output, 'fonts.css'), styles.join('\n'));
copyFileSync(resolve('node_modules/@radix-ui/react-select/LICENSE'), resolve(output, '../radix-ui-LICENSE.txt'));
copyFileSync(resolve('THIRD_PARTY_NOTICES.md'), resolve(output, '../THIRD_PARTY_NOTICES.txt'));
console.log('Self-hosted Outfit and Noto Sans KR fonts synchronized.');
