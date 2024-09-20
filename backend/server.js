require('dotenv').config();

const fs = require('fs');
const path = require('path');

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

const express = require('express');
const axios = require('axios');
const Replicate = require('replicate');
const cors = require('cors');
const { OpenAI } = require("openai");
const FormData = require('form-data');
const sharp = require('sharp'); // You might need to install this package: npm install sharp

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

const openaiApiKey = process.env.OPENAI_API_KEY;
const replicateApiToken = process.env.REPLICATE_API_TOKEN;
const printifyApiKey = process.env.PRINTIFY_API_KEY;
const printifyShopId = process.env.PRINTIFY_SHOP_ID;

console.log('PRINTIFY_API_KEY:', process.env.PRINTIFY_API_KEY);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

app.post('/api/generate', async (req, res) => {
  try {
    const { prompt } = req.body;
    console.log('Received prompt:', prompt);
    
    const refinedPrompt = await refinePrompt(prompt);
    console.log('Refined prompt:', refinedPrompt);
    
    const imageUrl = await generateImage(refinedPrompt);
    console.log('Generated image URL:', imageUrl);
    
    const uploadedImageId = await uploadToPrintify(imageUrl);
    console.log('Uploaded image ID:', uploadedImageId);

    const product = await createPrintifyProduct(uploadedImageId);
    console.log('Created product:', product);

    res.json({ imageUrl, product });
  } catch (error) {
    console.error('Detailed error in /api/generate:', error);
    res.status(500).json({ 
      error: error.message || 'An error occurred',
      details: error.response ? error.response.data : 'No additional details',
      stack: error.stack
    });
  }
});

app.get('/api/test-openai', async (req, res) => {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "Say this is a test" }],
      max_tokens: 7,
      temperature: 0,
    });
    res.json({ success: true, data: response });
  } catch (error) {
    console.error('OpenAI API Error:', error.response ? error.response.data : error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/test-replicate', async (req, res) => {
  try {
    const output = await replicate.run(
      "stability-ai/stable-diffusion:db21e45d3f7023abc2a46ee38a23973f6dce16bb082a930b0c49861f96d1e5bf",
      {
        input: {
          prompt: "a photo of an astronaut riding a horse on mars"
        }
      }
    );
    res.json({ success: true, data: output });
  } catch (error) {
    console.error('Replicate API Error:', error.response ? error.response.data : error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/test-printify', async (req, res) => {
  try {
    const response = await axios.get('https://api.printify.com/v1/shops.json', {
      headers: { 'Authorization': `Bearer ${process.env.PRINTIFY_API_KEY}` }
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error('Printify API Error:', error.response ? error.response.data : error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

async function refinePrompt(userPrompt) {
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a t-shirt designer. Refine the given prompt to create a clean, elegant, luxury, and modern t-shirt design. The t-shirt should be hanging on a hanger with a very clean background.' },
        { role: 'user', content: userPrompt },
      ],
    },
    {
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data.choices[0].message.content;
}

async function generateImage(refinedPrompt) {
  const output = await replicate.run("black-forest-labs/flux-schnell", {
    input: { prompt: refinedPrompt }
  });

  return output[0];
}

async function uploadToPrintify(imageUrl) {
  try {
    console.log('Downloading image from URL:', imageUrl);
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(imageResponse.data, 'binary');
    console.log('Image downloaded, size:', buffer.length, 'bytes');

    // Convert WebP to PNG and resize if necessary
    const pngBuffer = await sharp(buffer)
      .png()
      .resize(2000, 2000, { fit: 'inside' }) // Adjust size as needed
      .toBuffer();

    console.log('Image converted to PNG, new size:', pngBuffer.length, 'bytes');

    const data = {
      file_name: 'design.png',
      contents: pngBuffer.toString('base64')
    };

    console.log('Sending request to Printify...');
    const response = await axios.post('https://api.printify.com/v1/uploads/images.json', data, {
      headers: {
        'Authorization': `Bearer ${process.env.PRINTIFY_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Printify response:', response.data);
    return response.data.id;
  } catch (error) {
    console.error('Detailed Printify upload error:', error.response ? error.response.data : error.message);
    if (error.response && error.response.data) {
      console.error('Error details:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

async function createPrintifyProduct(imageId) {
  try {
    const blueprintId = 384; // T-shirt blueprint ID
    const printProviderId = 1; // Print provider ID

    const variants = await getProductVariants(blueprintId, printProviderId);
    console.log('Available variants:', variants);

    if (variants.length === 0) {
      throw new Error('No variants available for the selected blueprint and print provider');
    }

    const productData = {
      title: "AI Generated T-Shirt",
      description: "Custom t-shirt with AI-generated design",
      blueprint_id: blueprintId,
      print_provider_id: printProviderId,
      variants: variants.map(variant => ({
        id: variant.id,
        price: 2000 // Set your desired price
      })),
      print_areas: [
        {
          variant_ids: variants.map(variant => variant.id),
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

    console.log('Creating Printify product with data:', JSON.stringify(productData, null, 2));

    const response = await axios.post(
      `https://api.printify.com/v1/shops/${process.env.PRINTIFY_SHOP_ID}/products.json`,
      productData,
      {
        headers: {
          'Authorization': `Bearer ${process.env.PRINTIFY_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Printify product creation response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Detailed Printify product creation error:', error.response ? error.response.data : error.message);
    if (error.response && error.response.data) {
      console.error('Error details:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

async function downloadImage(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    console.log('Image download response status:', response.status);
    return Buffer.from(response.data, 'binary');
  } catch (error) {
    console.error('Error downloading image:', error.message);
    throw error;
  }
}

async function getPrintifyShopId() {
  try {
    const response = await axios.get('https://api.printify.com/v1/shops.json', {
      headers: { 'Authorization': `Bearer ${process.env.PRINTIFY_API_KEY}` }
    });
    return response.data[0].id;
  } catch (error) {
    console.error('Error fetching Printify shop ID:', error.response ? error.response.data : error.message);
    throw error;
  }
}

async function startServer() {
  try {
    const shopId = await getPrintifyShopId();
    console.log('Printify Shop ID:', shopId);
    process.env.PRINTIFY_SHOP_ID = shopId;

    app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
  }
}

startServer();

async function getProductVariants(blueprintId, printProviderId) {
  try {
    const response = await axios.get(
      `https://api.printify.com/v1/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/variants.json`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.PRINTIFY_API_KEY}`
        }
      }
    );
    return response.data.variants;
  } catch (error) {
    console.error('Error fetching variants:', error);
    throw error;
  }
}
