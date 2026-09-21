class DefaultExtension extends MProvider {

    constructor() {
        super();
        this.client = new Client();
        this.baseUrl = "https://animepahe.ru";

        // Simple async mutex to serialize requests.
        this._lock = Promise.resolve();
    }

    // =========================================================
    // Infrastructure: rate-limited request
    // =========================================================

    async withLock(fn) {
        const prev = this._lock;
        let release;
        this._lock = new Promise((r) => { release = r; });
        await prev;
        try {
            return await fn();
        } finally {
            release();
        }
    }

    async sleep(ms) {
        return new Promise((resolve) => {
            const t = setTimeout(resolve, ms);
        });
    }

    async apiGet(path) {
        return await this.withLock(async () => {
            const url = this.baseUrl + path;
            const res = await this.client.get(url, {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                    "AppleWebKit/537.36 (KHTML, like Gecko) " +
                    "Chrome/131.0.0.0 Safari/537.36",
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "en-US,en;q=0.9",
                "Referer": this.baseUrl + "/",
                "X-Requested-With": "XMLHttpRequest"
            });
            // Throttle
            await this.sleep(200);
            return res;
        });
    }

    async htmlGet(url) {
        return await this.withLock(async () => {
            const res = await this.client.get(url, {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                    "AppleWebKit/537.36 (KHTML, like Gecko) " +
                    "Chrome/131.0.0.0 Safari/537.36",
                "Accept":
                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Referer": this.baseUrl + "/"
            });
            await this.sleep(200);
            return res;
        });
    }

    // =========================================================
    // DTO parsing
    // =========================================================

    mapAnimeDto(dto) {
        return {
            name: dto.title || "Unknown",
            url: this.baseUrl + "/anime/" + (dto.session || ""),
            link: this.baseUrl + "/anime/" + (dto.session || ""),
            imageUrl: dto.poster || ""
        };
    }

    // =========================================================
    // Popular / Airing
    // =========================================================

    async getPopular(page) {
        try {
            const res = await this.apiGet("/api?m=airing&page=" + page);
            const json = JSON.parse(res.body);
            const data = json.data || [];

            const list = data.map((d) => this.mapAnimeDto(d));
            const lastPage = json.last_page || 1;

            return { list: list, hasNextPage: page < lastPage };

        } catch (err) {
            return {
                list: [{
                    name: "[Popular error] " + (err.message || err),
                    url: "", link: "", imageUrl: ""
                }],
                hasNextPage: false
            };
        }
    }

    async getLatestUpdates(page) {
        // Reuse airing — AnimePahe doesn't have a distinct "latest" feed.
        return await this.getPopular(page);
    }

    // =========================================================
    // Search
    // =========================================================

    async search(query, page, filters) {
        try {
            const res = await this.apiGet(
                "/api?m=search&q=" + encodeURIComponent(query)
            );
            const json = JSON.parse(res.body);
            const data = json.data || [];

            const list = data.map((d) => this.mapAnimeDto(d));

            return { list: list, hasNextPage: false };

        } catch (err) {
            return {
                list: [{
                    name: "[Search error] " + (err.message || err),
                    url: "", link: "", imageUrl: ""
                }],
                hasNextPage: false
            };
        }
    }

    async getSearch(query, page, filters) {
        return await this.search(query, page, filters);
    }

    // =========================================================
    // Detail + episodes
    // =========================================================

    async getDetail(url) {
        try {
            // Extract session id from URL: /anime/{session}
            const sessionMatch = url.match(/\/anime\/([^\/?#]+)/);
            const session = sessionMatch ? sessionMatch[1] : "";

            if (!session) {
                return {
                    url: url, title: "Invalid URL", imageUrl: "",
                    description: "", author: "", genre: [], status: 0,
                    episodes: []
                };
            }

            const res = await this.htmlGet(url);
            const doc = new Document(res.body);

            // Title
            let title = "";
            const titleEl = doc.selectFirst(".title-wrapper h1 span");
            if (titleEl) title = titleEl.text.trim();

            // Description — from meta or body
            let description = "";
            const descMeta = doc.selectFirst('meta[name="description"]');
            if (descMeta) description = descMeta.attr("content") || "";

            // Cover
            let imageUrl = "";
            const imgEl = doc.selectFirst(".anime-poster img");
            if (imgEl) imageUrl = imgEl.attr("src") || "";

            // Episodes via API (paginated)
            const episodes = [];
            let epPage = 1;
            let lastPage = 1;

            while (epPage <= lastPage && epPage <= 20) {
                const epRes = await this.apiGet(
                    "/api?m=episode&anime_session=" + session +
                    "&page=" + epPage +
                    "&sort=episode_asc"
                );
                const epJson = JSON.parse(epRes.body);
                const epData = epJson.data || [];
                lastPage = epJson.last_page || 1;

                for (const ep of epData) {
                    const epSession = ep.session || "";
                    const epNum = ep.episode || 0;
                    if (!epSession) continue;

                    episodes.push({
                        name: "Episode " + epNum,
                        url: this.baseUrl + "/play/" + session +
                             "/" + epSession,
                        scanlator: "English Subbed",
                        dateUpload: null
                    });
                }

                epPage++;
            }

            return {
                url: url,
                title: title,
                imageUrl: imageUrl,
                description: description,
                author: "",
                genre: [],
                status: 0,
                episodes: episodes
            };

        } catch (err) {
            return {
                url: url,
                title: "[Detail error] " + (err.message || err),
                imageUrl: "", description: "", author: "",
                genre: [], status: 0, episodes: []
            };
        }
    }

    // =========================================================
    // Video extraction
    // =========================================================

    /**
     * Extract base64-encoded kwik token.
     * Kwik embed pages contain: <script>...eval(function(p,a,c,k,e,d)...)</script>
     * or a direct /streaming-url pattern. This is the fragile part.
     */
    async extractFromKwik(embedUrl) {
        const res = await this.htmlGet(embedUrl);
        const html = res.body || "";

        const videos = [];

        // Strategy A: look for a JSON array of sources
        const sourcesMatch = html.match(
            /sources\s*:\s*(\[[\s\S]*?\])/
        );
        if (sourcesMatch) {
            try {
                const arr = JSON.parse(
                    sourcesMatch[1].replace(/(\w+)\s*:/g, '"$1":')
                );
                for (const s of arr) {
                    if (s.file) {
                        videos.push({
                            url: s.file,
                            originalUrl: s.file,
                            quality: s.label || "default",
                            headers: { "Referer": embedUrl }
                        });
                    }
                }
            } catch (e) { /* fall through */ }
        }

        // Strategy B: any mp4/m3u8 URL in the HTML
        if (videos.length === 0) {
            const urlRe = /https?:\/\/[^\s"'<>]+?\.(?:mp4|m3u8)[^\s"'<>]*/g;
            let m;
            while ((m = urlRe.exec(html)) !== null) {
                videos.push({
                    url: m[0],
                    originalUrl: m[0],
                    quality: "default",
                    headers: { "Referer": embedUrl }
                });
            }
        }

        return videos;
    }

    /**
     * From the play page, find the kwik embed link.
     */
    extractEmbedUrl(playHtml) {
        // Look for data-src in the buttons / menu
        const doc = new Document(playHtml);

        // AnimePahe uses buttons with data-src pointing to kwik
        const btn = doc.selectFirst("button[data-src]");
        if (btn) {
            const src = btn.attr("data-src");
            if (src && src.indexOf("kwik") !== -1) return src;
        }

        // Fallback: any kwik URL in the page
        const m = playHtml.match(/https?:\/\/kwik\.[^\s"'<>]+/);
        if (m) return m[0];

        return "";
    }

    async getVideoList(url) {
        try {
            const res = await this.htmlGet(url);
            const html = res.body || "";

            const embedUrl = this.extractEmbedUrl(html);

            if (!embedUrl) {
                return [{
                    url: "",
                    originalUrl: "",
                    quality: "[No embed found]",
                    headers: {}
                }];
            }

            const videos = await this.extractFromKwik(embedUrl);

            if (videos.length === 0) {
                return [{
                    url: "",
                    originalUrl: "",
                    quality: "[Extraction empty: " + embedUrl + "]",
                    headers: {}
                }];
            }

            return videos;

        } catch (err) {
            return [{
                url: "",
                originalUrl: "",
                quality: "[Video error] " + (err.message || err),
                headers: {}
            }];
        }
    }

}
