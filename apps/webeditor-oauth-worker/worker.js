const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, X-GitHub-Api-Version"
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

async function proxyToGitHub(url, body, method = "POST", headers = {}) {
    const upstreamHeaders = new Headers(headers);
    if (!upstreamHeaders.has("Accept")) {
        upstreamHeaders.set("Accept", "application/json");
    }
    if (method !== "GET" && method !== "HEAD") {
        if (!upstreamHeaders.has("Content-Type") && typeof body === "string") {
            upstreamHeaders.set("Content-Type", "application/json");
        }
    }

    const init = {
        method,
        headers: upstreamHeaders
    };

    if (body !== undefined && body !== null && !(method === "GET" || method === "HEAD")) {
        init.body = body;
    }

    return fetch(url, init);
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

        if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
            return textResponse("Worker secrets GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be configured.", 500);
        }

        if (url.pathname === "/github/device/code") {
            if (request.method !== "POST") {
                return textResponse("Method not allowed", 405);
            }
            const requestBody = await request.text();
            const params = new URLSearchParams(requestBody);
            params.set("client_id", env.GITHUB_CLIENT_ID);
            const githubResponse = await proxyToGitHub("https://github.com/login/device/code", params.toString(), "POST", {
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json"
            });
            const payload = await githubResponse.json();
            return jsonResponse(payload, githubResponse.status);
        }

        if (url.pathname === "/github/oauth/access_token") {
            if (request.method !== "POST") {
                return textResponse("Method not allowed", 405);
            }
            const requestBody = await request.text();
            const params = new URLSearchParams(requestBody);
            params.set("client_id", env.GITHUB_CLIENT_ID);
            params.set("client_secret", env.GITHUB_CLIENT_SECRET);
            const githubResponse = await proxyToGitHub("https://github.com/login/oauth/access_token", params.toString(), "POST", {
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json"
            });
            const payload = await githubResponse.json();
            return jsonResponse(payload, githubResponse.status);
        }

        if (url.pathname === "/github/proxy") {
            if (request.method !== "POST") {
                return textResponse("Method not allowed", 405);
            }

            const payload = await request.json().catch(() => ({}));
            const targetPath = String(payload.path || "");
            if (!targetPath) {
                return textResponse("Missing GitHub path to proxy.", 400);
            }

            const targetUrl = new URL(targetPath.startsWith("https://") || targetPath.startsWith("http://") ? targetPath : "https://api.github.com" + targetPath);
            const forwardedHeaders = payload.headers || {};
            const method = String(payload.method || "GET").toUpperCase();
            const body = Object.prototype.hasOwnProperty.call(payload, "body") ? payload.body : undefined;
            const forwardedBody = typeof body === "string" ? body : body === undefined ? undefined : JSON.stringify(body);

            const response = await proxyToGitHub(targetUrl.toString(), forwardedBody, method, forwardedHeaders);
            const text = await response.text();
            return new Response(text, {
                status: response.status,
                headers: {
                    "Content-Type": response.headers.get("content-type") || "application/json",
                    ...CORS_HEADERS
                }
            });
        }

        return textResponse("Not found", 404);
    }
};