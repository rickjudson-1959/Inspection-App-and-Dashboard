import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { image, mediaType, labourClassifications, equipmentTypes } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const prompt = `You are an expert at reading construction timesheets and daily tickets. Analyze this image of a contractor timesheet/daily ticket.

IMPORTANT HOUR RULES:
- A regular day is 8 hours maximum for Regular Time (RT)
- Any hours over 8 in a day are Overtime (OT)
- "Additional" hours on the ticket are "Jump Hours" (JH) - these are EXTRA regular time hours (not overtime)
- If someone worked 10 total hours with no "Additional" marked: RT=8, JH=0, OT=2
- If someone worked 8 hours + 2 "Additional": RT=8, JH=2, OT=0

Extract ALL employee/labour entries you can find. For each person, identify:
- Their name
- Their job classification (try to match to one of these: ${labourClassifications.join(', ')})
- Regular Time (RT) hours - max 8
- Jump Hours (JH) - from "Additional" field if present, otherwise 0
- Overtime (OT) hours - hours beyond 8 that are NOT marked as "Additional"

Also extract ANY equipment entries you can find:
- Unit ID or number
- Equipment type/description (try to match to one of these: ${equipmentTypes.join(', ')})
- Hours used

Return your response as valid JSON in this exact format:
{
  "labour": [
    {"name": "John Smith", "classification": "GENERAL LABOURER", "rt": 8, "jh": 0, "ot": 2},
    {"name": "Jane Doe", "classification": "WELDER HELPER", "rt": 8, "jh": 2, "ot": 0}
  ],
  "equipment": [
    {"unit": "EX-01", "description": "Backhoe - Cat 320", "hours": 8},
    {"unit": "AT-03", "description": "ATV/Gator", "hours": 6}
  ],
  "rawText": "Any additional text or notes you extracted from the document"
}

If you cannot read certain values clearly, make your best guess and include them. If a field is completely unreadable, use empty string for text or 0 for numbers.

IMPORTANT: Return ONLY the JSON object, no other text or explanation.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: image
                }
              },
              {
                type: 'text',
                text: prompt
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', errorText);
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.content[0].text;

    // Parse the JSON response
    let parsed;
    try {
      // Try to extract JSON from the response (in case there's extra text)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = JSON.parse(content);
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      // Return empty results if parsing fails
      parsed = {
        labour: [],
        equipment: [],
        rawText: content
      };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
