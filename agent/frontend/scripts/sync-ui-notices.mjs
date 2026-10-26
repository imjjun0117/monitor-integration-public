import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// 차트 표시의 TailAdmin 계보를 배포물에서도 고지한다.
const output = resolve('public/assets');
mkdirSync(output, { recursive: true });
copyFileSync(resolve('THIRD_PARTY_NOTICES.md'), resolve(output, 'THIRD_PARTY_NOTICES.txt'));
