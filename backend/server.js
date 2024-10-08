require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { refinePrompt } = require('./services/promptRefinement');
const { generateImage } = require('./services/imageGeneration');
const { createPrintifyProduct, fetchAvailableColors } = require('./services/printifyService');
const { getTshirtColors } = require('./config');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

app.get('/api/available-colors', async (req, res) => {
  try {
    const colors = getTshirtColors();
    res.json(colors);
  } catch (error) {
    console.error('Error fetching available colors:', error);
    res.status(500).json({ error: 'An error occurred while fetching available colors' });
  }
});

app.post('/api/generate-tshirt-design', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    // Step 1: Refine the user's prompt
    console.log('Refining prompt...');
    const { refinedPrompt, suggestedColor } = await refinePrompt(prompt);
    console.log('Refined prompt:', refinedPrompt);
    console.log('Suggested color:', suggestedColor);

    // Step 2: Generate image using Replicate
    console.log('Generating image...');
    const imageUrl = await generateImage(refinedPrompt);
    console.log('Image generated:', imageUrl);

    // Step 3: Create Printify product with the generated image
    console.log('Creating Printify product...');
    const printifyProduct = await createPrintifyProduct(imageUrl, refinedPrompt, suggestedColor);
    console.log('Printify product created:', printifyProduct.id);

    // Extract the front mock-up image URL from the Printify response
    const frontMockupImage = printifyProduct.images.find(img => img.position === 'front');
    const frontMockupUrl = frontMockupImage ? frontMockupImage.src : null;

    res.json({
      message: 'T-shirt design generated successfully',
      originalPrompt: prompt,
      refinedPrompt: refinedPrompt,
      suggestedColor: suggestedColor,
      selectedColor: printifyProduct.selectedColor,
      generatedImageUrl: imageUrl,
      printifyMockupUrl: frontMockupUrl,
      printifyProductId: printifyProduct.id
    });
  } catch (error) {
    console.error('Error in generate-tshirt-design:', error);
    const errorMessage = error.response ? JSON.stringify(error.response.data, null, 2) : error.message;
    res.status(500).json({ 
      error: 'An error occurred while generating the t-shirt design', 
      details: errorMessage,
      stack: error.stack
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});