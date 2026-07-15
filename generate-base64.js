const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src', 'assets');
const destFile = path.join(srcDir, 'logoBase64.ts');

const inl = fs.readFileSync(path.join(srcDir, 'inl.png')).toString('base64');
const inlRight = fs.readFileSync(path.join(srcDir, 'logo_INL_right.png')).toString('base64');

const content = `export const LOGO_INL_BASE64 = "data:image/png;base64,${inl}";\nexport const LOGO_INL_RIGHT_BASE64 = "data:image/png;base64,${inlRight}";\n`;

fs.writeFileSync(destFile, content);
console.log('Successfully generated logoBase64.ts with correct quotes!');
