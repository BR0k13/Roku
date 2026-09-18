const mangayomiSources = [
    {
        "name": "AniDB",
        "lang": "en",
        "baseUrl": "https://anidb.se",
        "apiUrl": "",
        "iconUrl": "https://raw.githubusercontent.com/BR0k13/Roku/main/images/icons/anidb.png",
        "typeSource": "single",
        "itemType": 1,
        "isNsfw": false,
        "version": "0.2.8",
        "pkgPath": "anime/src/en/anidb.js",
        "notes": "AniDB anime source"
    }
];

class DefaultExtension extends MProvider {

    constructor() {
        super();
        this.client = new Client();

        this._seenUrls = new Set();
        this._seenTitles = new Set();
    }

    makeAbsoluteUrl(url) {

        if (!url) {
            return "";
        }

        if (
            url.startsWith("http://") ||
            url.startsWith("https://")
        ) {
            return url;
        }

        if (url.startsWith("//")) {
            return "https:" + url;
        }

        if (url.startsWith("/")) {
            return this.source.baseUrl + url;
        }

        return this.source.baseUrl + "/" + url;
    }

    normalizeUrl(url) {

        if (!url) {
            return "";
        }

        let normalized =
            url.split("?")[0].split("#")[0];

        normalized =
            normalized.replace(/\/+$/, "");

        normalized =
            normalized.toLowerCase();

        return normalized;
    }

    extractTitle(element) {

        const img =
            element.selectFirst("img");

        if (img) {

            const alt =
                (img.attr("alt") || "").trim();

            if (alt.length > 1) {
                return alt;
            }
        }

        const titleAttr =
            (element.attr("title") || "").trim();

        if (titleAttr.length > 1) {
            return titleAttr;
        }

        const titleSelectors = [
            ".tt",
            ".title",
            ".entry-title",
            ".anime-title",
            ".name",
            "h2",
            "h3",
            "h4"
        ];

        for (const sel of titleSelectors) {

            const el =
                element.selectFirst(sel);

            if (el) {

                const t =
                    el.text.trim();

                if (t) {
                    return t;
                }
            }
        }

        let text =
            element.text.trim();

        text = text
            .replace(
                /^(TV|ONA|OVA|Movie|Special)\s*/i,
                ""
            )
            .trim();

        if (
            text.length >= 2 &&
            text.length % 2 === 0
        ) {

            const half =
                text.length / 2;

            if (
                text.slice(0, half) ===
                text.slice(half)
            ) {
                text = text.slice(0, half);
            }
        }

        return text;
    }

    extractImage(element) {

        const img =
            element.selectFirst("img");

        if (!img) {
            return "";
        }

        const attrs = [
            "data-src",
            "data-lazy-src",
            "data-original",
            "data-img",
            "src"
        ];

        for (const attr of attrs) {

            const v =
                (img.attr(attr) || "").trim();

            if (
                v &&
                !v.startsWith("data:")
            ) {
                return this.makeAbsoluteUrl(v);
            }
        }

        return "";
    }

    isUiJunk(title) {

        const t =
            title.toLowerCase().trim();

        const junk = [
            "text mode",
            "grid",
            "list",
            "list mode",
            "grid mode",
            "view",
            "view all",
            "sort",
            "filter",
            "next",
            "prev",
            "previous",
            "search"
        ];

        return junk.includes(t);
    }

    /*
     * Parse a set of <a href*="/anime/"> elements
     * into the standard list format. Used by
     * getPopular, getLatestUpdates, and getSearch
     * so all three endpoints stay consistent.
     *
     * Returns { list, newCount } so callers can
     * decide whether pagination should continue.
     */
    parseAnimeCards(animeLinks) {

        const list = [];
        let newCount = 0;

        for (const element of animeLinks) {

            const href =
                element.attr("href");

            if (!href) {
                continue;
            }

            const cleanHref =
                href.split("?")[0].split("#")[0];

            if (
                /\/anime\/?$/.test(cleanHref)
            ) {
                continue;
            }

            if (
                /\/anime\/page\/\d+\/?$/.test(
                    cleanHref
                )
            ) {
                continue;
            }

            const img =
                element.selectFirst("img");

            if (!img) {
                continue;
            }

            const absoluteUrl =
                this.makeAbsoluteUrl(cleanHref);

            if (!absoluteUrl) {
                continue;
            }

            const urlKey =
                this.normalizeUrl(absoluteUrl);

            if (this._seenUrls.has(urlKey)) {
                continue;
            }

            const title =
                this.extractTitle(element);

            if (!title || title.length < 2) {
                continue;
            }

            if (this.isUiJunk(title)) {
                continue;
            }

            const titleKey =
                title.toLowerCase().trim();

            if (this._seenTitles.has(titleKey)) {
                continue;
            }

            this._seenUrls.add(urlKey);
            this._seenTitles.add(titleKey);
            newCount++;

            const imageUrl =
                this.extractImage(element);

            list.push({
                name: title,
                url: absoluteUrl,
                link: absoluteUrl,
                imageUrl: imageUrl
            });
        }

        return {
            list: list,
            newCount: newCount
        };
    }

    async getPopular(page) {

        if (page === 1) {
            this._seenUrls = new Set();
            this._seenTitles = new Set();
        }

        if (!this._seenUrls) {
            this._seenUrls = new Set();
        }

        if (!this._seenTitles) {
            this._seenTitles = new Set();
        }

        let url;

        if (page === 1) {
            url = this.source.baseUrl + "/anime/";
        } else {
            url =
                this.source.baseUrl +
                "/anime/page/" +
                page +
                "/";
        }

        const response =
            await this.client.get(url);

        const document =
            new Document(response.body);

        const animeLinks =
            document.select(
                'a[href*="/anime/"]'
            );

        const result =
            this.parseAnimeCards(animeLinks);

        let hasNextPage = false;

        if (result.newCount > 0) {

            const pageLinks =
                document.select(
                    'a[href*="/anime/page/"]'
                );

            for (const link of pageLinks) {

                const href =
                    link.attr("href") || "";

                const match =
                    href.match(
                        /\/anime\/page\/(\d+)\/?$/
                    );

                if (
                    match &&
                    parseInt(match[1], 10) > page
                ) {
                    hasNextPage = true;
                    break;
                }
            }

            if (
                !hasNextPage &&
                document.selectFirst(
                    'link[rel="next"]'
                )
            ) {
                hasNextPage = true;
            }
        }

        return {
            list: result.list,
            hasNextPage: hasNextPage
        };
    }

    /*
     * Latest Updates.
     *
     * Common WordPress anime sites expose latest
     * episodes at /episodes/ (Dooplay) or latest
     * anime at /anime/?orderby=date. We try
     * /episodes/ first since it best matches the
     * "Latest" tab, then fall back to the anime
     * archive ordered by date.
     */
    async getLatestUpdates(page) {

        if (page === 1) {
            this._seenUrls = new Set();
            this._seenTitles = new Set();
        }

        let url;

        if (page === 1) {
            url =
                this.source.baseUrl +
                "/episodes/";
        } else {
            url =
                this.source.baseUrl +
                "/episodes/page/" +
                page +
                "/";
        }

        let response;

        try {

            response =
                await this.client.get(url);

        } catch (e) {

            /*
             * Fallback: anime archive ordered by date.
             */

            let fallbackUrl;

            if (page === 1) {
                fallbackUrl =
                    this.source.baseUrl +
                    "/anime/?orderby=date";
            } else {
                fallbackUrl =
                    this.source.baseUrl +
                    "/anime/page/" +
                    page +
                    "/?orderby=date";
            }

            response =
                await this.client.get(fallbackUrl);
        }

        const document =
            new Document(response.body);

        /*
         * Latest pages typically link to
         * episode pages like "/<slug>-episode-N"
         * OR to anime detail pages. We collect
         * both, then convert episode links to
         * their parent anime where possible.
         */

        let animeLinks =
            document.select(
                'a[href*="/anime/"]'
            );

        /*
         * If the page has no anime-detail links
         * (typical for a Dooplay /episodes/ page),
         * fall back to scraping episode links and
         * deriving the parent anime URL from the
         * slug.
         */

        if (animeLinks.length === 0) {

            const episodeLinks =
                document.select(
                    'a[href*="-episode-"]'
                );

            const derivedSeen =
                new Set();

            const list = [];

            for (const el of episodeLinks) {

                let href =
                    el.attr("href");

                if (!href) {
                    continue;
                }

                href =
                    href.split("?")[0].split("#")[0];

                const match =
                    href.match(
                        /\/([^\/]+?)-episode-\d+\/?$/
                    );

                if (!match) {
                    continue;
                }

                const slug = match[1];

                if (derivedSeen.has(slug)) {
                    continue;
                }

                derivedSeen.add(slug);

                const animeUrl =
                    this.source.baseUrl +
                    "/anime/" +
                    slug +
                    "/";

                const title =
                    this.extractTitle(el) || slug;

                if (this.isUiJunk(title)) {
                    continue;
                }

                const urlKey =
                    this.normalizeUrl(animeUrl);

                if (this._seenUrls.has(urlKey)) {
                    continue;
                }

                this._seenUrls.add(urlKey);

                let imageUrl =
                    this.extractImage(el);

                /*
                 * If the card the episode link is
                 * inside has an <img>, use it.
                 */

                list.push({
                    name: title,
                    url: animeUrl,
                    link: animeUrl,
                    imageUrl: imageUrl
                });
            }

            return {
                list: list,
                hasNextPage:
                    this.hasNextPageInDoc(
                        document,
                        page,
                        "/episodes/page/"
                    )
            };
        }

        const result =
            this.parseAnimeCards(animeLinks);

        return {
            list: result.list,
            hasNextPage:
                result.newCount > 0 &&
                this.hasNextPageInDoc(
                    document,
                    page,
                    "/episodes/page/"
                )
        };
    }

    /*
     * Search.
     *
     * Uses the WordPress default search endpoint
     * ("/?s=<query>"), which most anime themes
     * support. Pagination is "/page/N/?s=<query>".
     */
    async getSearch(query, page, filters) {

        if (page === 1) {
            this._seenUrls = new Set();
            this._seenTitles = new Set();
        }

        const encoded =
            encodeURIComponent(query);

        let url;

        if (page === 1) {
            url =
                this.source.baseUrl +
                "/?s=" +
                encoded;
        } else {
            url =
                this.source.baseUrl +
                "/page/" +
                page +
                "/?s=" +
                encoded;
        }

        const response =
            await this.client.get(url);

        const document =
            new Document(response.body);

        const animeLinks =
            document.select(
                'a[href*="/anime/"]'
            );

        const result =
            this.parseAnimeCards(animeLinks);

        return {
            list: result.list,
            hasNextPage:
                result.newCount > 0 &&
                this.hasNextPageInDoc(
                    document,
                    page,
                    "/page/"
                )
        };
    }

    /*
     * Helper: does this document contain a link
     * to a page number greater than the current
     * page under the given prefix?
     */
    hasNextPageInDoc(document, page, prefix) {

        const links =
            document.select(
                'a[href*="' + prefix + '"]'
            );

        const regex =
            new RegExp(
                prefix.replace(/\//g, "\\/") +
                "(\\d+)\\/?"
            );

        for (const link of links) {

            const href =
                link.attr("href") || "";

            const match =
                href.match(regex);

            if (
                match &&
                parseInt(match[1], 10) > page
            ) {
                return true;
            }
        }

        if (document.selectFirst('link[rel="next"]')) {
            return true;
        }

        return false;
    }

    async getDetail(url) {

        const response =
            await this.client.get(url);

        const document =
            new Document(response.body);

        /* -------------------------
           TITLE
        ------------------------- */

        let title = "";

        const titleElement =
            document.selectFirst("h1");

        if (titleElement) {
            title =
                titleElement.text.trim();
        }

        /* -------------------------
           COVER
        ------------------------- */

        let imageUrl = "";

        const coverLink =
            document.selectFirst(
                'a[href*="wp.com"]'
            );

        if (coverLink) {

            const href =
                coverLink.attr("href");

            if (href) {
                imageUrl =
                    this.makeAbsoluteUrl(href);
            }
        }

        if (!imageUrl) {

            const images =
                document.select("img");

            for (const image of images) {

                let src =
                    image.attr("src");

                if (!src) {
                    src =
                        image.attr("data-src");
                }

                if (!src) {
                    continue;
                }

                if (
                    src.includes("wp.com")
                ) {

                    imageUrl =
                        this.makeAbsoluteUrl(src);

                    break;
                }
            }
        }

        /* -------------------------
           SYNOPSIS
        ------------------------- */

        let description = "";

        const paragraphs =
            document.select("p");

        for (const element of paragraphs) {

            const text =
                element.text.trim();

            if (!text) {
                continue;
            }

            if (
                text.includes(
                    "Your email address will not be published"
                )
            ) {
                continue;
            }

            if (
                text.includes(
                    "Required fields are marked"
                )
            ) {
                continue;
            }

            if (text.length < 20) {
                continue;
            }

            description = text;
            break;
        }

        /* -------------------------
           GENRES
        ------------------------- */

        const genres = [];

        const genreElements =
            document.select(
                'a[href*="genre"]'
            );

        for (const element of genreElements) {

            const genre =
                element.text.trim();

            if (
                genre &&
                !genres.includes(genre)
            ) {
                genres.push(genre);
            }
        }

        /* -------------------------
           EPISODES
        ------------------------- */

        const episodes = [];

        const seenEpisodes =
            new Set();

        let animeSlug = "";

        const animeMatch =
            url.match(
                /\/anime\/([^\/?#]+)/
            );

        if (animeMatch) {
            animeSlug =
                animeMatch[1];
        }

        const episodePrefix =
            "/" +
            animeSlug +
            "-episode-";

        const episodeLinks =
            document.select(
                'a[href*="-episode-"]'
            );

        for (const element of episodeLinks) {

            let href =
                element.attr("href");

            if (!href) {
                continue;
            }

            if (
                href.startsWith(
                    this.source.baseUrl
                )
            ) {

                href =
                    href.substring(
                        this.source.baseUrl.length
                    );
            }

            href =
                href.split("?")[0];

            href =
                href.split("#")[0];

            if (
                !href.startsWith(
                    episodePrefix
                )
            ) {
                continue;
            }

            const numberMatch =
                href.match(
                    /-episode-(\d+)/
                );

            if (!numberMatch) {
                continue;
            }

            const episodeNumber =
                numberMatch[1];

            const episodeUrl =
                this.makeAbsoluteUrl(href);

            if (
                seenEpisodes.has(
                    episodeUrl
                )
            ) {
                continue;
            }

            seenEpisodes.add(
                episodeUrl
            );

            episodes.push({
                name:
                    "Episode " +
                    episodeNumber,

                url:
                    episodeUrl,

                scanlator:
                    "English Subbed",

      
