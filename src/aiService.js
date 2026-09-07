const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

async function analyzeFoodImage(
  imagePath,
  mimeType = "image/jpeg"
) {
  if (!fs.existsSync(imagePath)) {
    throw new Error("Image file not found");
  }

  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString("base64");

  const prompt = `
You are a calorie tracking assistant.

Analyze the food shown in this image.

Identify the visible food items and estimate:
- food name
- portion size
- calories
- protein
- carbohydrates
- fat

IMPORTANT:
- These are estimates only.
- Do not claim the values are exact.
- Estimate portion size from the visible food.
- If you are uncertain, explain it in the note.
- Return ONLY valid JSON.
- Do not use markdown.

Return exactly this structure:

{
  "foods": [
    {
      "food_name": "string",
      "portion": "string",
      "calories": 0,
      "protein": 0,
      "carbs": 0,
      "fat": 0
    }
  ],
  "total_calories": 0,
  "note": "string"
}
`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        inlineData: {
          mimeType,
          data: base64Image
        }
      },
      {
        text: prompt
      }
    ]
  });

  const text = response.text.trim();

  const cleanedText = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return JSON.parse(cleanedText);
}

module.exports = {
  analyzeFoodImage
};