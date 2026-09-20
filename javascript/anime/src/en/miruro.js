const mangayomiSources = [
    {
        "name": "Miruro",
        "lang": "en",
        "baseUrl": "https://www.miruro.ru",
        "apiUrl": "https://graphql.anilist.co",
        "iconUrl": "https://www.miruro.ru/favicon.ico",
        "typeSource": "single",
        "itemType": 1,
        "isNsfw": false,
        "version": "0.1.0",
        "pkgPath": "anime/src/en/miruro.js",
        "notes": "Miruro anime source (AniList metadata + pipe API streams)"
    }
];

class DefaultExtension extends MProvider {

    constructor() {
        super();
        this.client = new Client();
        this.miruroBases = [
            "https://www.miruro.ru",
            "https://www.miruro.bz",
            "https://www.miruro.online"
        ];
    }

    // =========================================================
    // Base64url + gzip helpers
    // =========================================================

    base64UrlEncode(str) {
        const b64 = btoa(str);
        return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }

    base64UrlDecode(str) {
        let s = str.replace(/-/g, "+").replace(/_/g, "/");
        while (s.length % 4) {
            s += "=";
        }
        return atob(s);
    }

    // Convert a base64 string into a Uint8Array
    base64ToBytes(b64) {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    // Gzip decompress using pako (must be available in Mangayomi)
    gunzip(bytes) {
        if (typeof pako !== "undefined" && pako.ungzip) {
            return pako.ungzip(bytes, { to: "string" });
        }
        // Fallback: try DecompressionStream (may not exist in all builds)
        if (typeof DecompressionStream !== "undefined") {
            // DecompressionStream is async; we handle it in decodePipeResponse
            return null;
        }
        throw new Error("No gzip decompressor available");
    }

    decodePipeResponse(encoded) {
        // Add padding
        let s = encoded.replace(/-/g, "+").replace(/_/g, "/");
        while (s.length % 4) {
            s += "=";
        }
        const bytes = this.base64ToBytes(s);
        const text = this.gunzip(bytes);
        if (text === null) {
            throw new Error("gzip fallback not available in sync context");
        }
        return JSON.parse(text);
    }

    async decodePipeResponseAsync(encoded) {
        let s = encoded.replace(/-/g, "+").replace(/_/g, "/");
        while (s.length % 4) {
            s += "=";
        }
        const bytes = this.base64ToBytes(s);

        if (typeof pako !== "undefined" && pako.ungzip) {
            return JSON.parse(pako.ungzip(bytes, { to: "string" }));
        }

        if (typeof DecompressionStream !== "undefined") {
            const ds = new DecompressionStream("gzip");
            const stream = new Blob([bytes]).stream().pipeThrough(ds);
            const buf = await new Response(stream).arrayBuffer();
            const text = new TextDecoder().decode(buf);
            return JSON.parse(text);
        }

        throw new Error("No gzip decompressor available");
    }

    encodePipeRequest(payload) {
        return this.base64UrlEncode(JSON.stringify(payload));
    }

    // =========================================================
    // AniList GraphQL
    // =========================================================

    async anilistQuery(query, variables) {
        const body = { query: query };
        if (variables) {
            body.variables = variables;
        }

        const response = await this.client.post(
            "https://graphql.anilist.co",
            {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Origin": "https://www.miruro.ru",
                "Referer": "https://www.miruro.ru/"
            },
            JSON.stringify(body)
        );

        const json = JSON.parse(response.body);
        return json.data || {};
    }

    // =========================================================
    // Miruro pipe API
    // =========================================================

    async pipeRequest(payload) {
        const encoded = this.encodePipeRequest(payload);

        let lastError = null;

        for (const base of this.miruroBases) {
            const url = base + "/api/secure/pipe?e=" + encoded;
            try {
                const response = await this.client.get(url, {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                    "Origin": base,
                    "Referer": base + "/"
                });

                if (response.statusCode === 200 && response.body) {
                    return await this.decodePipeResponseAsync(response.body.trim());
                }
            } catch (e) {
                lastError = e;
            }
        }

        throw lastError || new Error("All Miruro pipes failed");
    }

    // =========================================================
    // Metadata
    // =========================================================

    mediaListFields() {
        return `
            id
            title { romaji english native }
            coverImage { large extraLarge }
            bannerImage
            format
            status
            episodes
            averageScore
            seasonYear
            genres
            description
        `;
    }

    mapMediaToItem(media) {
        const title =
            (media.title && (media.title.english || media.title.romaji)) ||
            "Unknown";
        const image =
            media.coverImage &&
            (media.coverImage.extraLarge || media.coverImage.large);

        return {
            name: title,
            url: "https://www.miruro.ru/info/" + media.id,
            link: "https://www.miruro.ru/info/" + media.id,
            imageUrl: image || ""
        };
    }

    async getPopular(page) {
        const gql = `
            query ($page: Int, $perPage: Int) {
                Page(page: $page, perPage: $perPage) {
                    pageInfo { currentPage lastPage hasNextPage }
                    media(type: ANIME, sort: POPULARITY_DESC) {
                        ${this.mediaListFields()}
                    }
                }
            }
        `;

        const data = await this.anilistQuery(gql, { page: page, perPage: 30 });
        const pageData = data.Page || {};
        const media = pageData.media || [];
        const pageInfo = pageData.pageInfo || {};

        const list = media.map((m) => this.mapMediaToItem(m));

        return {
            list: list,
            hasNextPage: pageInfo.hasNextPage || false
        };
    }

    async getLatestUpdates(page) {
        const gql = `
            query ($page: Int, $perPage: Int) {
                Page(page: $page, perPage: $perPage) {
                    pageInfo { currentPage lastPage hasNextPage }
                    media(type: ANIME, sort: UPDATED_AT_DESC) {
                        ${this.mediaListFields()}
                    }
                }
            }
        `;

        const data = await this.anilistQuery(gql, { page: page, perPage: 30 });
        const pageData = data.Page || {};
        const media = pageData.media || [];
        const pageInfo = pageData.pageInfo || {};

        const list = media.map((m) => this.mapMediaToItem(m));

        return {
            list: list,
            hasNextPage: pageInfo.hasNextPage || false
        };
    }

    async search(query, page, filters) {
        const gql = `
            query ($search: String, $page: Int, $perPage: Int) {
                Page(page: $page, perPage: $perPage) {
                    pageInfo { currentPage lastPage hasNextPage }
                    media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
                        ${this.mediaListFields()}
                    }
                }
            }
        `;

        const data = await this.anilistQuery(gql, {
            search: query,
            page: page,
            perPage: 30
        });

        const pageData = data.Page || {};
        const media = pageData.media || [];
        const pageInfo = pageData.pageInfo || {};

        const list = media.map((m) => this.mapMediaToItem(m));

        return {
            list: list,
            hasNextPage: pageInfo.hasNextPage || false
        };
    }

    async getSearch(query, page, filters) {
        return await this.search(query, page, filters);
    }

    async getDetail(url) {
        // Extract AniList ID from URL like https://www.miruro.ru/info/123/...
        const idMatch = url.match(/\/info\/(\d+)/);
        const anilistId = idMatch ? parseInt(idMatch[1]) : 0;

        if (!anilistId) {
            return {
                url: url,
                title: "",
                imageUrl: "",
                description: "",
                author: "",
                genre: [],
                status: 0,
                episodes: []
            };
        }

        const gql = `
            query ($id: Int) {
                Media(id: $id, type: ANIME) {
                    id
                    title { romaji english native }
                    coverImage { large extraLarge }
                    bannerImage
                    description
                    format
                    status
                    episodes
                    duration
                    genres
                    seasonYear
                    averageScore
                }
            }
        `;

        const data = await this.anilistQuery(gql, { id: anilistId });
        const media = data.Media || {};

        const title =
            (media.title && (media.title.english || media.title.romaji)) || "";
        const image =
            media.coverImage &&
            (media.coverImage.extraLarge || media.coverImage.large);
        const description = (media.description || "").replace(/<[^>]+>/g, "");

        // Fetch episodes via Miruro pipe
        let episodes = [];

        try {
            const raw = await this.pipeRequest({
                path: "episodes",
                method: "GET",
                query: { anilistId: anilistId },
                body: null,
                version: "0.1.0"
            });

            // The response shape varies; try common structures
            const providerMap = raw.providers || {};
            const firstProvider = Object.keys(providerMap)[0];
            const providerData = providerMap[firstProvider] || {};
            const epMap = providerData.episodes || {};

            // epMap may be { sub: [...], dub: [...] }
            const subList = epMap.sub || [];
            const list = Array.isArray(subList) ? subList : [];

            for (const ep of list) {
                // ep.id is base64url-encoded tracking string
                let trackingId = ep.id || "";
                try {
                    trackingId = this.base64UrlDecode(trackingId);
                } catch (e) {
                    // keep original if decode fails
                }

                episodes.push({
                    name: "Episode " + (ep.number || "?"),
                    url: "https://www.miruro.ru/watch/" + anilistId +
                         "/" + encodeURIComponent(ep.id || "") +
                         "?provider=" + encodeURIComponent(firstProvider || "bee"),
                    scanlator: "English Subbed",
                    dateUpload: null
                });
            }
        } catch (e) {
            // Episodes failed — leave empty
        }

        // Sort newest first
        episodes.sort((a, b) => {
            const an = parseInt((a.name.match(/\d+/) || [0])[0]);
            const bn = parseInt((b.name.match(/\d+/) || [0])[0]);
            return bn - an;
        });

        return {
            url: url,
            title: title,
            imageUrl: image || "",
            description: description,
            author: "",
            genre: media.genres || [],
            status: media.status === "RELEASING" ? 1 : 0,
            episodes: episodes
        };
    }

    // =========================================================
    // Video extraction
    // =========================================================

    async getVideoList(url) {
        // URL format: https://www.miruro.ru/watch/{anilistId}/{episodeId}?provider=bee
        const match = url.match(/\/watch\/(\d+)\/([^?]+)\?provider=([^&]+)/);
        if (!match) {
            return [];
        }

        const anilistId = parseInt(match[1]);
        const episodeId = decodeURIComponent(match[2]);
        const provider = decodeURIComponent(match[3]);

        // The episodeId in the URL is base64url-encoded; re-encode it for the API
        // (Miruro expects the encoded form in the pipe payload)
        const encEpisodeId = this.base64UrlEncode(
            this.base64UrlDecode(episodeId)
        );

        const videos = [];

        // Try both sub and dub categories
        const categories = ["sub", "dub"];

        for (const category of categories) {
            try {
                const raw = await this.pipeRequest({
                    path: "sources",
                    method: "GET",
                    query: {
                        episodeId: encEpisodeId,
                        provider: provider,
                        category: category,
                        anilistId: anilistId
                    },
                    body: null,
                    version: "0.1.0"
                });

                // Response typically has { streams: [ { url, quality, ... } ] }
                const streams = raw.streams || raw.sources || [];

                for (const stream of streams) {
                    const streamUrl = stream.url || stream.file || "";
                    if (!streamUrl) {
                        continue;
                    }

                    videos.push({
                        url: streamUrl,
                        originalUrl: streamUrl,
                        quality: (stream.quality || category + " stream").toString(),
                        headers: {
                            "Referer": "https://www.miruro.ru/",
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
                        }
                    });
                }

                if (videos.length > 0 && category === "sub") {
                    // Prefer sub but still try dub if sub yielded nothing
                    break;
                }
            } catch (e) {
                // Try next category
            }
        }

        return videos;
    }

}
