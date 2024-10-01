const OpenAI = require('openai');
const { getTshirtColors } = require('../config');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function refinePrompt(userPrompt) {
  const availableColors = getTshirtColors();
  const refinementPrompt = `Refine the following t-shirt design prompt to create a beautiful, luxurious, elegant, and vivid design suitable for printing on a t-shirt. The design should have a transparent background so it can be easily applied to different colored t-shirts. Expand on the user's ideas while keeping the essence of their concept. The refined prompt should be under 1000 characters and should explicitly mention the need for a transparent background. Also, suggest a t-shirt color from the available options that would best complement the design.

Available t-shirt colors: ${availableColors.join(', ')}

User's prompt: "${userPrompt}"

Output your response in the following format:
1. Refined Design Prompt: [Your refined prompt here, including a mention of transparent background]
2. Suggested T-shirt Color: [Your color suggestion here, must be one of the available colors]`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: refinementPrompt }],
      max_tokens: 500,
      temperature: 0.7,
    });

    const output = response.choices[0].message.content.trim();
    console.log("GPT-4o output:", output);

    const [refinedPromptLine, suggestedColorLine] = output.split('\n');
    const refinedPrompt = refinedPromptLine.split(': ')[1];
    const suggestedColor = suggestedColorLine.split(': ')[1];

    console.log("Parsed refined prompt:", refinedPrompt);
    console.log("Parsed suggested color:", suggestedColor);

    // Ensure the refined prompt includes a mention of transparent background
    const finalRefinedPrompt = refinedPrompt.includes("transparent background") 
      ? refinedPrompt 
      : `${refinedPrompt} The design should have a transparent background.`;

    return { refinedPrompt: finalRefinedPrompt, suggestedColor };
  } catch (error) {
    console.error('Error refining prompt:', error);
    throw error;
  }
}

module.exports = { refinePrompt };
