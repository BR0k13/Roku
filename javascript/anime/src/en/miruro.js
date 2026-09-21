class DefaultExtension extends MProvider {

    constructor() {
        super();
        this.client = new Client();
        this.miruroBases = [
            "https://www.miruro.to",
            "https://www.miruro.ru",
            "https://www.miruro.bz",
            "https://www.miruro.online",
            "https://www.miruro.tv",
            "https://www.miruro.cc"
        ];
    }

    // =========================================================
    // Base64 helpers (no btoa / atob)
    // =========================================================

    _b64Chars() {
        return "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    }

    base64Encode(str) {
        const chars = this._b64Chars();
        let utf8 = "";
        for (let i = 0; i < str.length; i++) {
            const c = str.charCodeAt(i);
            if (c < 0x80) {
                utf8 += String.fromCharCode(c);
            } else if (c < 0x800) {
                utf8 += String.fromCharCode((c >> 6) | 0xC0);
                utf8 += String.fromCharCode((c & 0x3F) | 0x80);
            } else {
                utf8 += String.fromCharCode((c >> 12) | 0xE0);
                utf8 += String.fromCharCode(((c >> 6) & 0x3F) | 0x80);
                utf8 += String.fromCharCode((c & 0x3F) | 0x80);
            }
        }
        let result = "";
        const len = utf8.length;
        for (let i = 0; i < len; i += 3) {
            const b1 = utf8.charCodeAt(i);
            const b2 = i + 1 < len ? utf8.charCodeAt(i + 1) : 0;
            const b3 = i + 2 < len ? utf8.charCodeAt(i + 2) : 0;
            const e1 = b1 >> 2;
            const e2 = ((b1 & 3) << 4) | (b2 >> 4);
            const e3 = ((b2 & 15) << 2) | (b3 >> 6);
            const e4 = b3 & 63;
            result += chars.charAt(e1);
            result += chars.charAt(e2);
            result += i + 1 < len ? chars.charAt(e3) : "=";
            result += i + 2 < len ? chars.charAt(e4) : "=";
        }
        return result;
    }

    base64UrlEncode(str) {
        return this.base64Encode(str)
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
    }

    base64ToBytes(b64) {
        const chars = this._b64Chars();
        let cleaned = "";
        for (let i = 0; i < b64.length; i++) {
            const c = b64.charAt(i);
            if (chars.indexOf(c) !== -1) {
                cleaned += c;
            }
        }
        const len = cleaned.length;
        const outLen = Math.floor(len * 3 / 4);
        const out = new Uint8Array(outLen);
        let outIdx = 0;
        for (let i = 0; i < len; i += 4) {
            const e1 = chars.indexOf(cleaned.charAt(i));
            const e2 = i + 1 < len ? chars.indexOf(cleaned.charAt(i + 1)) : 0;
            const e3 = i + 2 < len ? chars.indexOf(cleaned.charAt(i + 2)) : 0;
            const e4 = i + 3 < len ? chars.indexOf(cleaned.charAt(i + 3)) : 0;
            const b1 = (e1 << 2) | (e2 >> 4);
            const b2 = ((e2 & 15) << 4) | (e3 >> 2);
            const b3 = ((e3 & 3) << 6) | e4;
            if (outIdx < outLen) out[outIdx++] = b1 & 0xFF;
            if (i + 2 < len && outIdx < outLen) out[outIdx++] = b2 & 0xFF;
            if (i + 3 < len && outIdx < outLen) out[outIdx++] = b3 & 0xFF;
        }
        return out;
    }

    base64Decode(str) {
        const bytes = this.base64ToBytes(str);
        let output = "";
        for (let i = 0; i < bytes.length; i++) {
            const c = bytes[i];
            if (c < 0x80) {
                output += String.fromCharCode(c);
            } else if (c < 0xE0) {
                const c2 = bytes[i + 1];
                output += String.fromCharCode(((c & 0x1F) << 6) | (c2 & 0x3F));
                i++;
            } else {
                const c2 = bytes[i + 1];
                const c3 = bytes[i + 2];
                output += String.fromCharCode(
                    ((c & 0x0F) << 12) | ((c2 & 0x3F) << 6) | (c3 & 0x3F)
                );
                i += 2;
            }
        }
        return output;
    }

    base64UrlDecode(str) {
        let s = str.replace(/-/g, "+").replace(/_/g, "/");
        while (s.length % 4) {
            s += "=";
        }
        return this.base64Decode(s);
    }

    // =========================================================
    // Gzip decode
    // =========================================================

    decodeGzip(bytes) {
        if (typeof pako !== "undefined" && pako.ungzip) {
            try {
                return pako.ungzip(bytes, { to: "string" });
            } catch (e) {
                // fall through
            }
        }
        if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
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
    // Browser-like headers
    // =========================================================

    browserHeaders(base) {
        return {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/131.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": base + "/",
            "Origin": base,
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin"
        };
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
                if (j.data) return j.data;
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
                if (j.data) return j.data;
                if (j.errors && j.errors.length) {
                    errors.push("GET-URL: " + j.errors[0].message);
                }
            }
        } catch (e) {
            errors.push("GET-URL: " + (e.message || e));
        }

        throw new Error(errors.join(" || "));
    }

    // =========================================================
    // Miruro pipe API — direct + multi-proxy fallback
    // =========================================================

    async pipeRequest(payload) {
        const encoded = this.encodePipeRequest(payload);
        const errors = [];

        // -------- Strategy 1: direct with browser headers --------
        for (const base of this.miruroBases) {
            const url = base + "/api/secure/pipe?e=" + encoded;
            try {
                const response = await this.client.get(
                    url,
                    this.browserHeaders(base)
                );

                if (!response || !response.body) {
                    errors.push(base + ": empty");
                    continue;
                }

                const trimmed = response.body.trim();

                if (trimmed.length === 0) {
                    errors.push(base + ": blank");
                    continue;
                }

                if (
                    trimmed.indexOf("Cloudflare") !== -1 ||
                    trimmed.indexOf("cf-error") !== -1 ||
                    trimmed.indexOf("Attention Required") !== -1
                ) {
                    errors.push(base + ": CF-blocked");
                    continue;
                }

                try {
                    return this.decodePipeResponse(trimmed);
                } catch (decodeErr) {
                    errors.push(
                        base + ": decode → " +
                        (decodeErr.message || decodeErr) +
                        " | raw=" + trimmed.substring(0, 30)
                    );
                    continue;
                }
            } catch (e) {
                errors.push(base + ": " + (e.message || e));
            }
        }

        // -------- Strategy 2: multiple CORS proxies --------
        const proxyBuilders = [
            (t) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(t),
            (t) => "https://api.allorigins.win/get?url=" + encodeURIComponent(t),
            (t) => "https://corsproxy.io/?url=" + encodeURIComponent(t),
            (t) => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(t),
            (t) => "https://thingproxy.freeboard.io/fetch/" + t,
            (t) => "https://www.whateverorigin.org/get?url=" + encodeURIComponent(t)
        ];

        for (let p = 0; p < proxyBuilders.length; p++) {
            const build = proxyBuilders[p];
            for (const base of this.miruroBases) {
                const target = base + "/api/secure/pipe?e=" + encoded;
                let proxyUrl;
                try {
                    proxyUrl = build(target);
                } catch (e) {
                    continue;
                }

                const tag = "proxy" + p + "[" + base.replace("https://www.", "") + "]";

                try {
                    const response = await this.client.get(proxyUrl);

                    if (!response || !response.body) {
                        continue;
                    }

                    let trimmed = response.body.trim();

                    if (trimmed.length === 0) {
                        continue;
                    }

                    if (p === 1 || p === 5) {
                        try {
                            const wrapper = JSON.parse(trimmed);
                            if (wrapper && wrapper.contents) {
                                trimmed = wrapper.contents.trim();
                            } else if (wrapper && wrapper.data) {
                                trimmed = wrapper.data.trim();
                            } else if (wrapper && typeof wrapper === "string") {
                                trimmed = wrapper.trim();
                            }
                        } catch (e) {
                            // not JSON
                        }
                    }

                    if (trimmed.length === 0) {
                        continue;
                    }

                    if (
                        trimmed.indexOf("Cloudflare") !== -1 ||
                        trimmed.indexOf("Attention Required") !== -1 ||
                        trimmed.indexOf("Just a moment") !== -1
                    ) {
                        errors.push(tag + ": CF-blocked");
                        continue;
                    }

                    try {
                        return this.decodePipeResponse(trimmed);
                    } catch (decodeErr) {
                        errors.push(
                            tag + ": decode → " +
                            (decodeErr.message || decodeErr) +
                            " | raw=" + trimmed.substring(0, 30)
                        );
                        continue;
                    }
                } catch (e) {
                    errors.push(tag + ": " + (e.message || e));
                }
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

            const providers = raw.providers;

            if (!providers) {
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
                    if (!streamUrl) continue;
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
                
