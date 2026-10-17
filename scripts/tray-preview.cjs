const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

async function main() {
  const canvas = createCanvas(900, 300);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 900, 300);
  for (const [row, theme] of ['light', 'dark'].entries()) {
    const y = row * 150;
    ctx.fillStyle = theme === 'dark' ? '#202020' : '#f2f3f5';
    ctx.fillRect(0, y, 900, 150);
    ctx.fillStyle = theme === 'dark' ? '#ffffff' : '#222222';
    ctx.font = '14px Segoe UI'; ctx.fillText(`${theme} taskbar`, 18, y + 26);
    for (const [column, size] of [16, 20, 24].entries()) {
      const x = column * 300 + 15;
      ctx.fillText(`${size}px (actual / 4x)`, x, y + 50);
      for (const [index, id] of ['mouse', 'keyboard'].entries()) {
        const img = await loadImage(path.join(__dirname, '..', 'assets', 'tray', `${theme}-${id}-89.png`));
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, x + index * (size + 8), y + 68, size, size);
        const small = createCanvas(size, size);
        small.getContext('2d').drawImage(img, 0, 0, size, size);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(small, x + 70 + index * (size * 4 + 6), y + 54, size * 4, size * 4);
      }
    }
  }
  const output = path.join(__dirname, '..', '..', 'verification', 'tray-preview.png');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, canvas.toBuffer('image/png'));
  console.log(output);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
