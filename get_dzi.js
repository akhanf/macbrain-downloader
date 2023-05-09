const axios = require('axios');
const xml2js = require('xml2js');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');


async function findMaxZoomLevel(dziUrl, format) {
  for (let level = 20; level >= 0; level--) {  // start from a reasonably high number
    let tileUrl = dziUrl.replace('.dzi', `_files/${level}/0_0.${format}`);
    try {
      let response = await axios.head(tileUrl);
      if (response.status === 200) {
        return level;
      }
    } catch (error) {
      // ignore error and try next level
    }
  }
  throw new Error('No zoom levels found');
}

function getImageSizeAtLevel(width, height, maxLevel, level) {
  let scale = Math.pow(2, maxLevel - level);
  return {
    width: Math.ceil(width / scale),
    height: Math.ceil(height / scale)
  };
}

function getNumberOfTilesAtLevel(width, height, tileSize) {
  return {
    tilesX: Math.ceil(width / tileSize),
    tilesY: Math.ceil(height / tileSize)
  };
}


async function downloadImage(dziUrl,dspow,out_jpg) {
  // Download the .dzi file
  let response = await axios.get(dziUrl);
  let xml = response.data;

  // Parse the .dzi file
  let parser = new xml2js.Parser();
  let result = await parser.parseStringPromise(xml);
  let image = result.Image;
  let fullsize = image.Size[0]['$'];
  let format = image['$'].Format;
  let tileSize = parseInt(image['$'].TileSize);

  let maxLevel = await findMaxZoomLevel(dziUrl, 'jpeg');

  let level = maxLevel - dspow   
  let fullSize = { width: parseInt(fullsize.Width), height: parseInt(fullsize.Height) };

  let sizeAtLevel = getImageSizeAtLevel(fullSize.width, fullSize.height, maxLevel, level);
  console.log('Size at level', level, ':', sizeAtLevel);

  let numTiles = getNumberOfTilesAtLevel(sizeAtLevel.width, sizeAtLevel.height, tileSize)


  console.log('Max zoom level:', maxLevel);


  // Create a blank canvas to draw the tiles onto
  let canvas = sharp({
    create: {
      width: sizeAtLevel.width,
      height: sizeAtLevel.height,
      channels: 3,
      background: { r: 0, g: 0, b: 0 }
    }
  });


 
  let overlays = []; 

  // Download and draw each tile
  for (let y = 0; y < numTiles.tilesY; y++) {
    for (let x = 0; x < numTiles.tilesX; x++) {
      console.log(dziUrl.replace('.dzi', `_files/${level}/${x}_${y}.${format}`))
      let tileUrl = dziUrl.replace('.dzi', `_files/${level}/${x}_${y}.${format}`);
      let response = await axios.get(tileUrl, { responseType: 'arraybuffer' });
      let tile = sharp(response.data);
      let tileBuffer = await tile.toBuffer();
      overlays.push({ input: tileBuffer, left: x * tileSize, top: y * tileSize });

    }
  }

  canvas = await canvas.composite(overlays);

  // Save the final image
  await canvas.toFile(out_jpg);
}




async function listDziUrls(base, start, end) {
  let urls = [];
  for (let i = start; i <= end; i++) {
    let url = `${base}${i}.dzi`;
    try {
      let response = await axios.head(url);
      if (response.status === 200) {
        urls.push(url);
      }
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log(`No file found at ${url}`);
        break;
      } else {
        console.log(`An error occurred: ${error.message}`);
      }
    }
  }
  return urls;
}

let subject='B61';
let stain='CB';

let dspow=8;

let downsample = 2**dspow


fs.mkdir(`images/sub-${subject}`, { recursive: true }, (err) => {
  if (err) throw err;
});


listDziUrls(`https://macbraingallery.yale.edu/slides2/${subject}-${stain}/`, 5627, 6000)
  .then(dzi_urls => {
      console.log(dzi_urls)


dzi_urls.forEach((dzi_url, slice) => {
  console.log(`Slice: ${slice}, URL: ${dzi_url}`);
  let formattedSlice = String(slice).padStart(3, '0');  // "005"
  downloadImage(dzi_url,dspow,`images/sub-${subject}/sub-${subject}_stain-${stain}_downsample-${downsample}_slice-${formattedSlice}.jpg`)

});



  })
  .catch(error => console.error(error));



