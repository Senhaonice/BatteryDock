const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const lucide = require('lucide');
const directory = path.join(__dirname, '..', 'assets');
fs.mkdirSync(path.join(directory, 'tray'), { recursive: true });

function svgFor(name, color) {
  const nodes = lucide[name];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${nodes.map(([tag, attributes]) => `<${tag} ${Object.entries(attributes).map(([key, value]) => `${key}="${value}"`).join(' ')}/>`).join('')}</svg>`;
}

async function main() {
  fs.copyFileSync(path.join(path.dirname(require.resolve('lucide')), '..', 'umd', 'lucide.js'), path.join(directory, 'lucide.js'));
  const canvas = createCanvas(256, 256);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f2f5f4';
  ctx.beginPath(); ctx.roundRect(8, 8, 240, 240, 54); ctx.fill();
  ctx.strokeStyle = '#c7d3ce'; ctx.lineWidth = 2; ctx.stroke();
  const logo = await loadImage(Buffer.from(svgFor('BatteryCharging', '#238b51')));
  ctx.drawImage(logo, 40, 40, 176, 176);
  const png = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(directory, 'app.png'), png);
  const ico = Buffer.alloc(22);
  ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4); ico[6] = 0; ico[7] = 0;
  ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);
  fs.writeFileSync(path.join(directory, 'app.ico'), Buffer.concat([ico, png]));
  for (const theme of ['light', 'dark']) {
    const color = theme === 'dark' ? '#f4f5f6' : '#25272a';
    for (let value = 0; value <= 100; value++) {
      const image = createCanvas(32, 32), context = image.getContext('2d');
      context.fillStyle = value <= 20 ? (theme === 'dark' ? '#ff8a8d' : '#bd3039') : color;
      context.font = `600 ${value === 100 ? 19 : 24}px "Segoe UI"`;
      context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText(String(value), 16, 16, 32);
      fs.writeFileSync(path.join(directory, 'tray', `${theme}-${value}.png`), image.toBuffer('image/png'));
    }
    for (const [id, symbol] of [['mouse','Mouse'],['keyboard','Keyboard'],['app','BatteryMedium']]) {
      const image = createCanvas(32, 32), context = image.getContext('2d');
      const graphic = await loadImage(Buffer.from(svgFor(symbol, color)));
      context.drawImage(graphic, 2, 2, 28, 28);
      fs.writeFileSync(path.join(directory, 'tray', `${theme}-${id}.png`), image.toBuffer('image/png'));
    }
  }
  console.log('Generated application icon, 208 tray images and local Lucide bundle');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
