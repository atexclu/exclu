
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-auth",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { instagramUrl, excluHandle } = await req.json();

        if (!instagramUrl || !excluHandle) {
            return new Response(
                JSON.stringify({ error: "Missing instagramUrl or excluHandle" }),
                {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        // Determine the target URL to fetch
        let targetUrl = instagramUrl.trim();

        // If it looks like just a handle (no protocol, no slashes), prepend instagram.com
        if (!targetUrl.startsWith("http") && !targetUrl.includes("/")) {
            targetUrl = `https://www.instagram.com/${targetUrl}/`;
        } else if (!targetUrl.startsWith("http")) {
            // If it looks like a domain but no protocol
            targetUrl = `https://${targetUrl}`;
        }

        console.log(`Verifying: Fetching ${targetUrl} to look for exclu.at/${excluHandle}`);

        const response = await fetch(targetUrl, {
            method: "GET",
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept":
                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Cache-Control": "no-cache",
                "Pragma": "no-cache"
            },
        });

        if (!response.ok) {
            console.error(`Instagram fetch failed: ${response.status} ${response.statusText}`);
            // Fallback: If we can't fetch the profile (e.g. 404 or blocked), we fail verification
            // UNLESS it's a 429 (Too Many Requests) or 403 (Forbidden) which might just mean we are blocked as a bot.
            // In those cases, maybe we should be lenient?
            // For now, let's return false but with a specific error code so the frontend knows.
            return new Response(
                JSON.stringify({
                    verified: false,
                    error: `Could not fetch Instagram profile (Status: ${response.status})`
                }),
                {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        const html = await response.text();

        // Check for the link in the bio
        // We look for "exclu.at/handle"
        // Be case-insensitive just in case
        const expectedLink = `exclu.at/${excluHandle}`.toLowerCase();

        const lowerHtml = html.toLowerCase();

        // Simple check
        const verified = lowerHtml.includes(expectedLink);

        // Enhanced Logging
        const titleMatch = lowerHtml.match(/<title>(.*?)<\/title>/);
        const pageTitle = titleMatch ? titleMatch[1] : 'No title found';

        console.log(`[VERIFY-IG] Fetched ${html.length} bytes from ${targetUrl}`);
        console.log(`[VERIFY-IG] Page Title: "${pageTitle}"`);
        console.log(`[VERIFY-IG] Looking for string: "${expectedLink}"`);
        console.log(`[VERIFY-IG] Found match? ${verified ? 'YES' : 'NO'}`);

        if (!verified) {
            // If verification failed, maybe log a snippet to debug what we actually got
            console.log(`[VERIFY-IG] Content snippet: ${html.substring(0, 500).replace(/\n/g, ' ')}...`);
            if (pageTitle.includes('login') || pageTitle.includes('instagram')) {
                console.log(`[VERIFY-IG] Warning: Title suggests we might have hit a login wall or generic page.`);
            }
        }

        return new Response(JSON.stringify({ verified }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Error in verify-instagram function:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
