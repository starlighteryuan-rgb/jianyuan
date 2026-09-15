import { readFileSync } from 'node:fs';
const path = 'C:/Users/26067/.codex/attachments/0223fa4d-1db6-4b77-98cd-129409ee38b4/pasted-text.txt';
try {
  const content = readFileSync(path, 'utf8');
  console.log('=== LENGTH: ' + content.length + ' chars ===');
  console.log(content);
} catch (error) {
  console.error('ERROR', error.message);
}
