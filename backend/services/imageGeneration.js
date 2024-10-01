const Replicate = require("replicate");

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

async function generateImage(prompt) {
  console.log('Generating image with prompt:', prompt);
  
  const input = {
    prompt: `t-shirt design: ${prompt}, minimalist, elegant, suitable for screen printing`,
    output_format: 'png'
  };

  try {
    const output = await replicate.run(
      "black-forest-labs/flux-dev",
      { input }
    );

    console.log('Generated image URL:', output[0]);
    return output[0];
  } catch (error) {
    console.error('Error generating image:', error);
    throw error;
  }
}

module.exports = { generateImage };
