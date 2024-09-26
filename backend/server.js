require('dotenv').config();

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const axios = require('axios');
const crypto = require('crypto');

const envConfig = fs.readFileSync(path.resolve(__dirname, '.env'), 'utf8')
  .split('\n')
  .reduce((acc, line) => {
    const [key, value] = line.split('=');
    acc[key] = value;
    return acc;
  }, {});

process.env.OPENAI_API_KEY = envConfig.OPENAI_API_KEY;
process.env.REPLICATE_API_TOKEN = envConfig.REPLICATE_API_TOKEN;

console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY);
console.log('REPLICATE_API_TOKEN:', process.env.REPLICATE_API_TOKEN);

console.log('PRINTIFY_API_TOKEN from env:', process.env.PRINTIFY_API_TOKEN);

const PRINTIFY_API_TOKEN = process.env.PRINTIFY_API_TOKEN || 'your_hardcoded_token_here';
console.log('Using Printify API Token:', PRINTIFY_API_TOKEN);

const express = require('express');
const sharp = require('sharp');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const { updateTshirtColors, getTshirtColors } = require('./config');

const Replicate = require("replicate");
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

async function getPrintifyTshirtColors() {
  try {
    console.log('Fetching blueprints...');
    const blueprintsResponse = await axios.get(
      'https://api.printify.com/v1/catalog/blueprints.json',
      {
        headers: {
          'Authorization': `Bearer ${PRINTIFY_API_TOKEN}`
        }
      }
    );

    const tshirtBlueprint = blueprintsResponse.data.find(blueprint => 
      blueprint.title.toLowerCase().includes('t-shirt') || 
      blueprint.title.toLowerCase().includes('tee')
    );

    if (!tshirtBlueprint) {
      console.log('No t-shirt blueprint found');
      return [];
    }

    console.log('T-shirt blueprint found:', tshirtBlueprint.title, 'ID:', tshirtBlueprint.id);

    const providersResponse = await axios.get(
      `https://api.printify.com/v1/catalog/blueprints/${tshirtBlueprint.id}/print_providers.json`,
      {
        headers: {
          'Authorization': `Bearer ${PRINTIFY_API_TOKEN}`
        }
      }
    );

    console.log('Print providers:', providersResponse.data);

    if (providersResponse.data.length === 0) {
      console.log('No print providers found for this blueprint');
      return [];
    }

    // Use the first print provider
    const firstProvider = providersResponse.data[0];
    console.log('Using print provider:', firstProvider.title, 'ID:', firstProvider.id);

    const variantsResponse = await axios.get(
      `https://api.printify.com/v1/catalog/blueprints/${tshirtBlueprint.id}/print_providers/${firstProvider.id}/variants.json`,
      {
        headers: {
          'Authorization': `Bearer ${PRINTIFY_API_TOKEN}`
        }
      }
    );

    console.log('API Response:', JSON.stringify(variantsResponse.data, null, 2));

    // Extract unique colors from the variants
    const uniqueColors = new Set();
    if (variantsResponse.data && variantsResponse.data.variants) {
      variantsResponse.data.variants.forEach(variant => {
        if (variant.options && variant.options.color) {
          uniqueColors.add(variant.options.color);
        }
      });
    } else {
      console.log('No variants found in the API response');
    }

    const colors = Array.from(uniqueColors);
    console.log('Extracted colors:', colors);
    return colors;
  } catch (error) {
    console.error('Error fetching Printify t-shirt colors:', error.response ? error.response.data : error.message);
    throw error;
  }
}

async function fetchAndUpdateTshirtColors() {
  try {
    const colors = await getPrintifyTshirtColors();
    updateTshirtColors(colors);
    console.log('T-shirt colors updated and saved:', colors);
  } catch (error) {
    console.error('Failed to update t-shirt colors:', error);
  }
}

// Fetch colors on server start and update every 24 hours
fetchAndUpdateTshirtColors();
setInterval(fetchAndUpdateTshirtColors, 24 * 60 * 60 * 1000);

app.get('/api/tshirt-colors', (req, res) => {
  const colors = getTshirtColors();
  res.json(colors);
});

function constructTshirtDesignPrompt(userPrompt) {
  const availableColors = getTshirtColors();
  return `Create a single, cohesive t-shirt design based on this concept: "${userPrompt}"

Design Guidelines:
1. Create a minimal, luxury design suitable for a high-end t-shirt.
2. Use clean lines, simple shapes, and a very limited color palette (maximum 2-3 colors).
3. The design should be a single, unified concept - not multiple separate elements.
4. Consider negative space as an integral part of the design.
5. Avoid text or lettering unless absolutely essential to the concept.
6. The design should be easily recognizable from a distance but also reward closer inspection.
7. Consider these available t-shirt base colors: ${availableColors.join(', ')}.
8. Ensure the design is suitable for screen printing or direct-to-garment printing.

Output your response in the following format:
1. Refined Design Description: [A concise, detailed description of the single, unified t-shirt design in one paragraph. Focus on visual elements, avoiding explanations or justifications.]
2. Suggested T-shirt Color: [Choose one color from the available options that best complements the design, and briefly explain why.]`;
}

async function generateImage(prompt) {
  console.log('Generating image with prompt:', prompt);
  
  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });

  const input = {
    prompt: `t-shirt design: ${prompt}, minimalist, elegant, suitable for screen printing`,
    output_format: 'png'  // Specify PNG output
  };

  try {
    const output = await replicate.run(
      "black-forest-labs/flux-schnell",
      { input }
    );

    console.log('Generated image URL:', output[0]);
    return output[0];  // The first (and usually only) URL in the output array
  } catch (error) {
    console.error('Error generating image:', error);
    throw error;
  }
}

async function createPrintifyProduct(imageUrl, description) {
  console.log('Starting createPrintifyProduct function');
  console.log('Image URL:', imageUrl);

  try {
    // Extract file name from URL
    const fileName = path.basename(new URL(imageUrl).pathname);

    // Upload image to Printify
    console.log('Uploading image to Printify...');
    const uploadResponse = await axios.post('https://api.printify.com/v1/uploads/images.json', 
      { 
        url: imageUrl,
        file_name: fileName
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.PRINTIFY_API_TOKEN}`,
        },
      }
    );

    console.log('Image upload response:', uploadResponse.data);

    if (!uploadResponse.data || !uploadResponse.data.id) {
      throw new Error('Failed to upload image to Printify');
    }

    const imageId = uploadResponse.data.id;

    // Create product
    console.log('Creating Printify product...');
    const productData = {
      title: "Custom T-Shirt Design",
      description: description,
      blueprint_id: 945,
      print_provider_id: 39,
      variants: [
        {
          id: 78061,
          price: 2000,
          is_enabled: true
        }
        // Add more variants here if needed
      ],
      print_areas: [
        {
          variant_ids: [78061], // Add all variant IDs here
          placeholders: [
            {
              position: "front",
              images: [
                {
                  id: imageId,
                  x: 0.5,
                  y: 0.5,
                  scale: 1,
                  angle: 0
                }
              ]
            }
          ]
        }
      ]
    };

    console.log('Product data:', JSON.stringify(productData, null, 2));

    const createProductResponse = await axios.post(
      'https://api.printify.com/v1/shops/18059043/products.json',
      productData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.PRINTIFY_API_TOKEN}`,
        },
      }
    );

    console.log('Printify product creation response:', createProductResponse.data);

    if (!createProductResponse.data || !createProductResponse.data.id) {
      throw new Error('Failed to create Printify product: No product ID returned');
    }

    return createProductResponse.data;

  } catch (error) {
    console.error('Error in createPrintifyProduct:', error);
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Headers:', error.response.headers);
      console.error('Response Data:', error.response.data);
    }
    throw error;
  }
}

async function generateTShirtDesign(req, res) {
  try {
    const { prompt } = req.body;
    const imageUrl = await generateImage(prompt);
    const printifyProduct = await createPrintifyProduct(imageUrl, prompt);

    // Extract the front mock-up image URL from the Printify response
    const frontMockupImage = printifyProduct.images.find(img => img.position === 'front');
    const frontMockupUrl = frontMockupImage ? frontMockupImage.src : null;

    res.json({
      message: 'T-shirt design generated successfully',
      imageUrl: imageUrl, // This is the Flux-Schnell generated image
      printifyImageUrl: frontMockupUrl, // This is the Printify mock-up image
      printifyProductId: printifyProduct.id
    });
  } catch (error) {
    console.error('Error in generate-tshirt-design:', error);
    res.status(500).json({ error: 'An error occurred while generating the t-shirt design' });
  }
}

// ... rest of your server code ...

// Make sure you have a route that calls generateTShirtDesign
app.post('/api/generate-tshirt-design', generateTShirtDesign);

const port = process.env.PORT || 3001;

try {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
} catch (error) {
  console.error('Failed to start the server:', error);
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// If you're exporting any functions or variables, use module.exports instead of export
module.exports = {
  generateTShirtDesign,
  // ... any other exports
};
