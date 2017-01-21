require('console-stamp')(console, {
  colors: {
    stamp: "yellow",
    label: "white",
  },
});
const pify = require('pify');
const fs = require('fs');
const path = require('path');
const Canvas = require('canvas');
Image = Canvas.Image;

CONFIG = {
  width: 1408,
  height: 1920,
  // width: 512,
  // height: 512,
  block: 128,
  src: 'original/',
  out: 'sample/',
};

const eachPixel = (data, cb) => {
  for (let y = 0; y <= data.height - 1; y++) {
    for (let x = 0; x <= data.width - 1; x++) {
      const offset = (y * data.width + x) * 4;
      cb([x, y], data.data.slice(offset, offset + 4));
    }
  }
};

const shuffle = (arr) => {
  let n = arr.length, t, i;
  while (n) {
    i = Math.floor(Math.random() * n--);
    t = arr[n];
    arr[n] = arr[i];
    arr[i] = t;
  }
  return arr;
};

const grayscale = (rgba) => {
  const y = 0.299 * rgba[0] + 0.587 * rgba[1] + 0.114 * rgba[2];
  return [y, y, y, rgba[3]];
};

const randomMap = (mapSize) => {
  return shuffle(Array.from({length: mapSize[0] * mapSize[1]}, (_, i) => {
    const y = Math.floor(i / mapSize[0]);
    return [i - y * mapSize[0], y];
  })).reduce((mapping, v, i) => {
    const y = Math.floor(i / mapSize[0]);
    mapping[y] = mapping[y] || [];
    mapping[y][i - y * mapSize[0]] = v;
    return mapping;
  }, []);
};

const resize = (ctx, img, width, height) => {
  ctx.translate(width, 0);
  ctx.rotate(Math.PI / 2);
  const scale = Math.max(width / img.height, height / img.width);
  ctx.drawImage(img, 0, 0, img.width * scale, img.height * scale);
};

const tile = function(imageData, blockMapping, blockSize) {
  const pixels = [];
  eachPixel(imageData, (coord, rgba) => {
    const block = coord.map((v) => Math.floor(v / blockSize));
    const blockCoord = block.map((v, i) => coord[i] - v * blockSize);
    const _block = blockMapping[block[1]][block[0]];
    const _coord = _block.map((v, i) => v * blockSize + blockCoord[i]);
    pixels[_coord[1]] = pixels[_coord[1]] || [];
    pixels[_coord[1]][_coord[0]] = grayscale(rgba);
  });
  pixels.forEach((row, y) => {
    row.forEach((cell, x) => {
      const offset = (y * row.length + x) * 4;
      cell.forEach((v, i) => {
        imageData.data[offset + i] = v;
      });
    });
  });
};

const isImage = (name) => {
  return /\.(png|gif|jpg|jpeg)/.test(name);
};

const removeExt = (name) => {
  return name.replace(/\..+$/, '');
}

(async function(c) {
  console.log('checkout new files...');
  const files = (await pify(fs.readdir)(path.resolve(__dirname, c.src))).filter(isImage);
  const existFiles = (await pify(fs.readdir)(path.resolve(__dirname, c.out))).filter(isImage).map(removeExt);
  const newFiles = files.filter((name) => {
    return !existFiles.includes(removeExt(name));
  })
  if (newFiles.length !== 0) {
    console.log(`(new) ${newFiles.join(', ')}`);
  } else {
    console.log(`(up-to-date)`);
  }
  for (let i = 0; i <= newFiles.length - 1; i++) {
    console.log(`loading ${newFiles[i]}...`);
    const bufOrg = await pify(fs.readFile)(path.resolve(__dirname, c.src, newFiles[i]));
    const imgOrg = new Image();
    imgOrg.src = bufOrg;
    const canvas = new Canvas(c.width, c.height);
    const ctx = canvas.getContext('2d');
    resize(ctx, imgOrg, c.width, c.height);
    const imageData = ctx.getImageData(0, 0, c.width, c.height);
    const mapSize = [c.width / c.block, c.height / c.block];
    const blockMapping = randomMap(mapSize);
    console.log('processing image...');
    tile(imageData, blockMapping, c.block);
    ctx.putImageData(imageData, 0, 0);
    const buf = await pify((cb) => canvas.toBuffer(cb))();
    console.log('writing image...');
    await pify(fs.writeFile)(path.resolve(__dirname, c.out, `${removeExt(newFiles[i])}.png`), buf);
    console.log('writing json...');
    await pify(fs.writeFile)(path.resolve(__dirname, c.out, `${removeExt(newFiles[i])}.json`), JSON.stringify(blockMapping));
    console.log(`DONE: (${newFiles[i]})`);
  }
  console.log('ALL FINISHED');
})(CONFIG);

process.on('unhandledRejection', (err) => {
  console.error(err.stack);
  throw err;
});
