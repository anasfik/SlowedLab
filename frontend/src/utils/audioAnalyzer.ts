/**
 * AI Preset Recommender using OpenAI
 * Experimental feature - easy to remove if needed
 */

export interface PresetRecommendation {
  name: string;
  matchScore: number;
  reason: string;
  icon: string;
}

/**
 * Extracts audio features by sampling the buffer
 * Returns a description of the audio characteristics
 */
export function extractAudioFeatures(buffer: AudioBuffer): string {
  const channelData = buffer.getChannelData(0);
  const samplePoints = 20;
  const sampleInterval = Math.floor(channelData.length / samplePoints);

  // Calculate RMS energy
  let energySum = 0;
  for (let i = 0; i < samplePoints; i++) {
    const idx = i * sampleInterval;
    const sample = channelData[idx] || 0;
    energySum += sample * sample;
  }
  const rmsEnergy = Math.sqrt(energySum / samplePoints);
  const energyLevel = rmsEnergy > 0.3 ? 'high energy' : rmsEnergy > 0.1 ? 'moderate energy' : 'low energy';

  // Estimate frequency characteristics via zero crossings
  let zeroCrossings = 0;
  for (let i = 1; i < Math.min(1000, channelData.length); i++) {
    if ((channelData[i] > 0 && channelData[i - 1] < 0) || (channelData[i] < 0 && channelData[i - 1] > 0)) {
      zeroCrossings++;
    }
  }
  const frequencyCharacter = zeroCrossings > 50 ? 'bright, high-frequency content' : zeroCrossings > 20 ? 'balanced frequency range' : 'dark, bass-heavy content';

  // Detect dynamics
  let min = 0, max = 0;
  for (let i = 0; i < samplePoints; i++) {
    const val = Math.abs(channelData[i * sampleInterval]);
    min = Math.min(min, val);
    max = Math.max(max, val);
  }
  const dynamicRange = max - min;
  const dynamicsDescription = dynamicRange > 0.5 ? 'dynamic with sharp contrasts' : dynamicRange > 0.2 ? 'moderate dynamics' : 'consistent dynamics';

  return `Audio characteristics: ${energyLevel}, ${frequencyCharacter}, ${dynamicsDescription}. Duration: ${buffer.duration.toFixed(1)}s, Sample rate: ${buffer.sampleRate}Hz`;
}

/**
 * Calls OpenAI to get preset recommendations based on audio analysis
 */
export async function recommendPresetsWithOpenAI(
  audioFeatures: string,
  availablePresets: Array<{ name: string; icon: string; description: string }>
): Promise<PresetRecommendation[]> {
  const openaiApiKey = process.env.REACT_APP_OPENAI_API_KEY;
  
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not configured. Set REACT_APP_OPENAI_API_KEY environment variable.');
  }

  const presetsList = availablePresets
    .map(p => `- ${p.icon} ${p.name}: ${p.description}`)
    .join('\n');

  const prompt = `You are an expert audio engineer. Based on the following audio analysis, recommend the 3 best preset effects from the list below that would enhance this audio.

Audio Analysis:
${audioFeatures}

Available Presets:
${presetsList}

Respond in JSON format with an array of 3 objects, each with:
- name (string): exact preset name from the list
- matchScore (number): 0-100 confidence score
- reason (string): 1-2 sentence explanation why this preset fits

Example format:
[
  { "name": "Slowed + Reverb", "matchScore": 85, "reason": "The moderate dynamics would benefit from added space and warmth." },
  { "name": "Lo-Fi Chill", "matchScore": 72, "reason": "Smooth, consistent dynamics pair well with lo-fi ambience." },
  { "name": "Ethereal Dream", "matchScore": 65, "reason": "High reverb complement the bright frequency content." }
]

Respond ONLY with the JSON array, no other text.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No recommendation content from OpenAI');
    }

    // Parse JSON response
    const recommendations = JSON.parse(content);

    // Validate response format
    if (!Array.isArray(recommendations) || recommendations.length === 0) {
      throw new Error('Invalid recommendation format from OpenAI');
    }

    // Add icons from original presets
    const presetsMap = new Map(availablePresets.map(p => [p.name, p.icon]));
    return recommendations.map((rec: any) => ({
      name: rec.name,
      matchScore: Math.min(100, Math.max(0, rec.matchScore)),
      reason: rec.reason || 'Recommended for your audio',
      icon: presetsMap.get(rec.name) || '🎚️',
    }));
  } catch (err) {
    console.error('OpenAI recommendation failed:', err);
    throw err;
  }
}
