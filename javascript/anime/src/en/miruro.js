class DefaultExtension extends MProvider {

    constructor() {
        super();
        this.client = new Client();
        this.miruroBases = [
            "https://www.miruro.to",
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

    base64ToBytes(b64) {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    // Try multiple gzip approaches.
    decodeGzip(bytes) {

        // Approach 1: pako
        if (typeof pako !== "undefined" && pako.ungzip) {
            try {
                return pako.ungzip(bytes, { to: "string" });
            } catch (e) {
                // fall through
            }
        }

        // Approach 2: Check if it's actually already plaintext (not gzipped).
        // Gzip magic bytes are 0x1f 0x8b. If the first bytes aren't those,
        // treat the data as plain UTF-8.
        if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
            // Not gzipped — decode as UTF-8 text
            let s = "";
            for (let i = 0; i < bytes.length; i++) {
                s += String.fromCharCode(bytes[i]);
            }
            try {
                return decodeURIComponent(escape(s));
            } catch (e) {
                return s;
            }
        }

        // Approach 3: DecompressionStream (async) — we can't do this
        // in a sync context. Signal to caller.
        throw new Error(
            "gzip required but pako unavailable (first bytes: " +
            bytes[0] + "," + bytes[1] + ")"
        );
    }

    decodePipeResponse(encoded) {
        let s = encoded.replace(/-/g, "+").replace(/_/g, "/");
        while (s.length % 4) {
            s += "=";
        }
        const bytes = this.base64ToBytes(s);
        const text = this.decodeGzip(bytes);
        return JSON.parse(text);
    }

    encodePipeRequest(payload) {
        return this.base64UrlEncode(JSON.stringify(payload));
    }

    minifyQuery(q) {
        if (!q) {
            return "";
        }
        return q
            .replace(/\s+/g, " ")
            .replace(/\s*([{}():,\[\]!])\s*/g, "$1")
            .replace(/,\s*/g, ",")
            .trim();
    }

    // =========================================================
    // AniList GraphQL
    // =========================================================

    async anilistQuery(query, variables) {

        const minified = this.minifyQuery(query);

        const params =
            "query=" + encodeURIComponent(minified) +
            "&variables=" + encodeURIComponent(JSON.stringify(variables || {}));

        const url = "https://graphql.anilist.co?" + params;

        const errors = [];

        try {
            const r = await this.client.post(url, {}, {});
            if (r && r.body) {
                const j = JSON.parse(r.body);
                if (j.data) {
                    return j.data;
                }
                if (j.errors && j.errors.length) {
                    errors.push("POST-URL: " + j.errors[0].message);
                }
            }
        } catch (e) {
            errors.push("POST-URL: " + (e.message || e));
        }

        try {
            const r = await this.client.get(url);
            if (r && r.body) {
                const j = JSON.parse(r.body);
                if (j.data) {
                    return j.data;
                }
                if (j.errors && j.errors.length) {
                    errors.push("GET-URL: " + j.errors[0].message);
                }
            }
        } catch (e) {
            errors.push("GET-URL: " + (e.message || e));
        }

        try {
            const r = await this.client.post(
                "https://graphql.anilist.co",
                { "data": JSON.stringify({ query: minified, variables: variables || {} }) },
                { "Content-Type": "application/json" }
            );
            if (r && r.body) {
                const j = JSON.parse(r.body);
                if (j.data) {
                    return j.data;
                }
                if (j.errors && j.errors.length) {
                    errors.push("POST-STR: " + j.errors[0].message);
                }
            }
        } catch (e) {
            errors.push("POST-STR: " + (e.message || e));
        }

        throw new Error(errors.join(" || "));
    }

    // =========================================================
    // Miruro pipe API
    // =========================================================

    async pipeRequest(payload) {
        const encoded = this.encodePipeRequest(payload);
        const errors = [];

        for (const base of this.miruroBases) {
            const url = base + "/api/secure/pipe?e=" + encoded;
            try {
                const response = await this.client.get(url, {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                    "Origin": base,
                    "Referer": base + "/"
                });

                if (!response || !response.body) {
                    errors.push(base + ": empty");
                    continue;
                }

                const trimmed = response.body.trim();

                if (trimmed.length === 0) {
                    errors.push(base + ": blank");
                    continue;
                }

                try {
                    return this.decodePipeResponse(trimmed);
                } catch (decodeErr) {
                    errors.push(
                        base + ": decode → " +
                        (decodeErr.message || decodeErr) +
                        " | raw=" + trimmed.substring(0, 40)
                    );
                    continue;
                }

            } catch (e) {
                errors.push(base + ": " + (e.message || e));
            }
        }

        throw new Error(errors.join(" || "));
    }

    // =========================================================
    // Metadata
    // =========================================================

    mediaListFields() {
        return `
            id
            title { romaji english native }
            coverImage { large extraLarge }
            format
            status
            episodes
            averageScore
            genres
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
            url: "https://www.miruro.to/info/" + media.id,
            link: "https://www.miruro.to/info/" + media.id,
            imageUrl: image || ""
        };
    }

    errorItem(label, err) {
        return {
            name: label + ": " + (err && err.message ? err.message : String(err)),
            url: "",
            link: "",
            imageUrl: ""
        };
    }

    // =========================================================
    // Endpoints
    // =========================================================

    async getPopular(page) {
        try {
            const gql = `
                query ($page: Int, $perPage: Int) {
                    Page(page: $page, perPage: $perPage) {
                        pageInfo { hasNextPage }
                        media(type: ANIME, sort: POPULARITY_DESC) {
                            ${this.mediaListFields()}
                        }
                    }
                }
            `;

            const data = await this.anilistQuery(gql, {
                page: page,
                perPage: 30
            });
            const pageData = data.Page || {};
            const list = (pageData.media || []).map(
                (m) => this.mapMediaToItem(m)
            );

            if (list.length === 0) {
                return {
                    list: [{
                        name: "[AniList returned 0 items for page " + page + "]",
                        url: "",
                        link: "",
                        imageUrl: ""
                    }],
                    hasNextPage: false
                };
            }

            return {
                list: list,
                hasNextPage: (pageData.pageInfo || {}).hasNextPage || false
            };

        } catch (err) {
            return {
                list: [this.errorItem("Popular error", err)],
                hasNextPage: false
            };
        }
    }

    async getLatestUpdates(page) {
        try {
            const gql = `
                query ($page: Int, $perPage: Int) {
                    Page(page: $page, perPage: $perPage) {
                        pageInfo { hasNextPage }
                        media(type: ANIME, sort: UPDATED_AT_DESC) {
                            ${this.mediaListFields()}
                        }
                    }
                }
            `;

            const data = await this.anilistQuery(gql, {
                page: page,
                perPage: 30
            });
            const pageData = data.Page || {};
            const list = (pageData.media || []).map(
                (m) => this.mapMediaToItem(m)
            );

            return {
                list: list,
                hasNextPage: (pageData.pageInfo || {}).hasNextPage || false
            };

        } catch (err) {
            return {
                list: [this.errorItem("Latest error", err)],
                hasNextPage: false
            };
        }
    }

    async search(query, page, filters) {
        try {
            const gql = `
                query ($search: String, $page: Int, $perPage: Int) {
                    Page(page: $page, perPage: $perPage) {
                        pageInfo { hasNextPage }
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
            const list = (pageData.media || []).map(
                (m) => this.mapMediaToItem(m)
            );

            return {
                list: list,
                hasNextPage: (pageData.pageInfo || {}).hasNextPage || false
            };

        } catch (err) {
            return {
                list: [this.errorItem("Search error", err)],
                hasNextPage: false
            };
        }
    }

    async getSearch(query, page, filters) {
        return await this.search(query, page, filters);
    }

    async getDetail(url) {
        const idMatch = url.match(/\/info\/(\d+)/);
        const anilistId = idMatch ? parseInt(idMatch[1]) : 0;

        if (!anilistId) {
            return {
                url: url,
                title: "No ID in URL",
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
                    description
                    status
                    genres
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

        const episodes = [];

        try {
            const raw = await this.pipeRequest({
                path: "episodes",
                method: "GET",
                query: { anilistId: anilistId },
                body: null,
                version: "0.1.0"
            });

            // Diagnostic: if response has no `providers` key, show its shape
            const providers = raw.providers;

            if (!providers) {
                // Show what keys we actually got
                const keys = Object.keys(raw).join(",");
                episodes.push({
                    name: "[DIAG] response keys: " + keys,
                    url: "diag",
                    scanlator: "",
                    dateUpload: null
                });
            } else {
                const firstProvider = Object.keys(providers)[0];
                const providerData = providers[firstProvider] || {};
                const epMap = providerData.episodes || {};
                const subList = epMap.sub || [];
                const list = Array.isArray(subList) ? subList : [];

                if (list.length === 0) {
                    episodes.push({
                        name: "[DIAG] provider=" + firstProvider +
                              " no sub episodes. epMap keys: " +
                              Object.keys(epMap).join(","),
                        url: "diag",
                        scanlator: "",
                        dateUpload: null
                    });
                }

                for (const ep of list) {
                    episodes.push({
                        name: "Episode " + (ep.number || "?"),
                        url: "https://www.miruro.to/watch/" + anilistId +
                             "/" + encodeURIComponent(ep.id || "") +
                             "?provider=" + encodeURIComponent(firstProvider || "bee"),
                        scanlator: "English Subbed",
                        dateUpload: null
                    });
                }
            }

        } catch (pipeErr) {
            // Surface the actual pipe error
            episodes.push({
                name: "[PIPE ERROR] " + (pipeErr.message || String(pipeErr)),
                url: "diag",
                scanlator: "",
                dateUpload: null
            });
        }

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
        const match = url.match(/\/watch\/(\d+)\/([^?]+)\?provider=([^&]+)/);
        if (!match) {
            return [];
        }

        const anilistId = parseInt(match[1]);
        const episodeId = decodeURIComponent(match[2]);
        const provider = decodeURIComponent(match[3]);

        const encEpisodeId = this.base64UrlEncode(
            this.base64UrlDecode(episodeId)
        );

        const videos = [];
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

                const streams = raw.streams || raw.sources || [];

                for (const stream of streams) {
                    const streamUrl = stream.url || stream.file || "";
                    if (!streamUrl) {
                        continue;
                    }

                    videos.push({
                        url: streamUrl,
                        originalUrl: streamUrl,
                        quality: (stream.quality || category).toString(),
                        headers: {
                            "Referer": "https://www.miruro.to/",
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
                        }
                    });
                }

                if (videos.length > 0 && category === "sub") {
                    break;
                }
            } catch (e) {
                // Try next category
            }
        }

        return videos;
    }

}
