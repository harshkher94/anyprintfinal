const axios = require('axios');
const path = require('path');
const { updateTshirtColors } = require('../config');

const PRINTIFY_API_TOKEN = process.env.PRINTIFY_API_TOKEN;

async function uploadImageToPrintify(imageUrl) {
  const fileName = path.basename(new URL(imageUrl).pathname);

  const uploadResponse = await axios.post('https://api.printify.com/v1/uploads/images.json', 
    { 
      url: imageUrl,
      file_name: fileName
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PRINTIFY_API_TOKEN}`,
      },
    }
  );

  if (!uploadResponse.data || !uploadResponse.data.id) {
    throw new Error('Failed to upload image to Printify');
  }

  return uploadResponse.data.id;
}

async function getShopId() {
  try {
    const response = await axios.get('https://api.printify.com/v1/shops.json', {
      headers: { 'Authorization': `Bearer ${PRINTIFY_API_TOKEN}` }
    });
    if (response.data && response.data.length > 0) {
      return response.data[0].id;
    }
    throw new Error('No shops found');
  } catch (error) {
    console.error('Error fetching shop ID:', error.response ? error.response.data : error.message);
    throw error;
  }
}

async function fetchAvailableColors(blueprintId, providerId) {
  const response = await axios.get(
    `https://api.printify.com/v1/catalog/blueprints/${blueprintId}/print_providers/${providerId}/variants.json`,
    {
      headers: { 'Authorization': `Bearer ${PRINTIFY_API_TOKEN}` }
    }
  );

  const colors = [...new Set(response.data.variants.map(variant => variant.options.color))];
  updateTshirtColors(colors);
  return colors;
}

async function createPrintifyProduct(imageUrl, description, suggestedColor) {
  try {
    console.log('Uploading image to Printify...');
    const imageId = await uploadImageToPrintify(imageUrl);
    console.log('Image uploaded, ID:', imageId);

    console.log('Fetching blueprints...');
    const blueprintsResponse = await axios.get('https://api.printify.com/v1/catalog/blueprints.json', {
      headers: { 'Authorization': `Bearer ${PRINTIFY_API_TOKEN}` }
    });
    const tshirtBlueprint = blueprintsResponse.data.find(blueprint => 
      blueprint.title.toLowerCase().includes('t-shirt') || 
      blueprint.title.toLowerCase().includes('tee')
    );

    if (!tshirtBlueprint) {
      throw new Error('No t-shirt blueprint found');
    }

    console.log('T-shirt blueprint found:', tshirtBlueprint.title, 'ID:', tshirtBlueprint.id);

    console.log('Fetching print providers...');
    const providersResponse = await axios.get(
      `https://api.printify.com/v1/catalog/blueprints/${tshirtBlueprint.id}/print_providers.json`,
      {
        headers: { 'Authorization': `Bearer ${PRINTIFY_API_TOKEN}` }
      }
    );

    if (providersResponse.data.length === 0) {
      throw new Error('No print providers found for this blueprint');
    }

    const firstProvider = providersResponse.data[0];
    console.log('Using print provider:', firstProvider.title, 'ID:', firstProvider.id);

    console.log('Fetching variant options...');
    const variantOptionsResponse = await axios.get(
      `https://api.printify.com/v1/catalog/blueprints/${tshirtBlueprint.id}/print_providers/${firstProvider.id}/variants.json`,
      {
        headers: { 'Authorization': `Bearer ${PRINTIFY_API_TOKEN}` }
      }
    );

    const availableColors = [...new Set(variantOptionsResponse.data.variants.map(variant => variant.options.color))];
    console.log('Available colors:', availableColors);

    let colorVariant;
    if (suggestedColor && availableColors.includes(suggestedColor)) {
      colorVariant = variantOptionsResponse.data.variants.find(variant => 
        variant.options.color.toLowerCase() === suggestedColor.toLowerCase()
      );
    }
    
    if (!colorVariant) {
      console.log('Suggested color not found or not provided, using default');
      colorVariant = variantOptionsResponse.data.variants[0];
    }

    console.log('Selected color:', colorVariant.options.color);

    const productData = {
      title: "Custom T-Shirt Design",
      description: description,
      blueprint_id: tshirtBlueprint.id,
      print_provider_id: firstProvider.id,
      variants: [
        {
          id: colorVariant.id,
          price: 2000,
          is_enabled: true
        }
      ],
      print_areas: [
        {
          variant_ids: [colorVariant.id],
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

    console.log('Creating product with data:', JSON.stringify(productData, null, 2));

    const shopId = await getShopId();
    console.log('Creating product for shop ID:', shopId);

    const response = await axios.post(`https://api.printify.com/v1/shops/${shopId}/products.json`, productData, {
      headers: { 'Authorization': `Bearer ${PRINTIFY_API_TOKEN}` }
    });

    console.log('Product created successfully');
    return {
      ...response.data,
      selectedColor: colorVariant.options.color
    };
  } catch (error) {
    console.error('Error in createPrintifyProduct:', error.response ? error.response.data : error.message);
    throw error;
  }
}

module.exports = { createPrintifyProduct, fetchAvailableColors };
