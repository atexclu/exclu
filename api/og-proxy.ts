import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userAgent = req.headers['user-agent'] || '';
  const path = req.url || '/';
  
  // Detect social media bots
  const botPattern = /bot|crawler|spider|facebook|twitter|whatsapp|telegram|linkedin|Twitterbot|facebookexternalhit|WhatsApp|TelegramBot|LinkedInBot|Slackbot|Discordbot/i;
  
  if (botPattern.test(userAgent)) {
    // Redirect bots to Supabase Edge Function
    const ogPreviewUrl = `https://qexnwezetjlbwltyccks.supabase.co/functions/v1/og-preview${path}`;
    
    try {
      const response = await fetch(ogPreviewUrl);
      const html = await response.text();
      
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(html);
    } catch (error) {
      console.error('Error fetching OG preview:', error);
      return res.status(500).send('Error generating preview');
    }
  }
  
  // For normal users, return 404 to let Vercel handle the SPA routing
  return res.status(404).send('Not found');
}
