const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
};

function jsonResponse(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS
        }
    });
}

function textResponse(message, status = 200) {
    return new Response(message, {
        status,
        headers: {
            "Content-Type": "text/plain; charset=UTF-8",
            ...CORS_HEADERS
        }
    });
}

async function proxyToGitHub(url, body) {
    return fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json"
        },
        body
    });
}

export default {
    async fetch(request, env) {
        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: CORS_HEADERS
            });
        }

        const url = new URL(request.url);

        if (request.method !== "POST") {
            return textResponse("Method not allowed", 405);
        }

        if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
            return textResponse("Worker secrets GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be configured.", 500);
        }

        if (url.pathname === "/github/device/code") {
            const requestBody = await request.text();
            const params = new URLSearchParams(requestBody);
            params.set("client_id", env.GITHUB_CLIENT_ID);

            const githubResponse = await proxyToGitHub("https://github.com/login/device/code", params);
            const payload = await githubResponse.json();
            return jsonResponse(payload, githubResponse.status);
        }

        if (url.pathname === "/github/oauth/access_token") {
            const requestBody = await request.text();
            const params = new URLSearchParams(requestBody);
            params.set("client_id", env.GITHUB_CLIENT_ID);
            params.set("client_secret", env.GITHUB_CLIENT_SECRET);

            const githubResponse = await proxyToGitHub("https://github.com/login/oauth/access_token", params);
            const payload = await githubResponse.json();
            return jsonResponse(payload, githubResponse.status);
        }

        return textResponse("Not found", 404);
    }
};