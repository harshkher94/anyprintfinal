const fs = require('fs');
const path = require('path');

const colorsFilePath = path.join(__dirname, 'tshirtColors.json');

let tshirtColors = [];

function loadTshirtColors() {
  try {
    const data = fs.readFileSync(colorsFilePath, 'utf8');
    tshirtColors = JSON.parse(data);
    console.log('Loaded t-shirt colors from file:', tshirtColors);
  } catch (error) {
    console.log('No saved t-shirt colors found. Colors will be fetched from API.');
  }
}

function updateTshirtColors(colors) {
  if (JSON.stringify(tshirtColors) !== JSON.stringify(colors)) {
    tshirtColors = colors;
    try {
      fs.writeFileSync(colorsFilePath, JSON.stringify(colors, null, 2));
      console.log('T-shirt colors updated and saved:', colors);
    } catch (error) {
      console.error('Error saving t-shirt colors to file:', error);
    }
  } else {
    console.log('T-shirt colors unchanged. No update needed.');
  }
}

function getTshirtColors() {
  return tshirtColors;
}

// Load colors when the module is first required
loadTshirtColors();

module.exports = {
  updateTshirtColors,
  getTshirtColors
};
