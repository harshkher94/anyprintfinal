const OpenAI = require('openai');
const { getTshirtColors } = require('../config');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function refinePrompt(userPrompt) {
  const refinementPrompt = `Refine the following t-shirt design prompt to create a beautiful, luxurious, elegant, and vivid design suitable for printing on a t-shirt. Expand on the user's ideas while keeping the essence of their concept. The refined prompt should be under 1000 characters. Also, suggest a t-shirt color from the available options that would best complement the design.

Available t-shirt colors: ${getTshirtColors().join(', ')}

User's prompt: "${userPrompt}"

Output your response in the following format:
1. Refined Design Prompt: [Your refined prompt here]
2. Suggested T-shirt Color: [Your color suggestion here]`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: refinementPrompt }],
      max_tokens: 500,
      temperature: 0.7,
    });

    const output = response.choices[0].message.content.trim();
    console.log("GPT-4 output:", output); // Add this line for debugging

    const [refinedPromptLine, suggestedColorLine] = output.split('\n');
    const refinedPrompt = refinedPromptLine.split(': ')[1];
    const suggestedColor = suggestedColorLine.split(': ')[1];

    console.log("Parsed refined prompt:", refinedPrompt); // Add this line for debugging
    console.log("Parsed suggested color:", suggestedColor); // Add this line for debugging

    return { refinedPrompt, suggestedColor };
  } catch (error) {
    console.error('Error refining prompt:', error);
    throw error;
  }
}

module.exports = { refinePrompt };
