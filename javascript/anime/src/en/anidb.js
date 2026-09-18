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
        "version": "0.3.2",
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

    buildList(animeLinks, titleFilter) {

        const list = [];
        let newCount = 0;

        const filterLower =
            titleFilter
                ? titleFilter.toLowerCase().trim()
                : "";

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

            if (filterLower) {

                if (
                    !title
                        .toLowerCase()
                        .includes(filterLower)
                ) {
                    continue;
                }
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
            this.buildList(animeLinks, "");

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
        }

        return {
            list: result.list,
            hasNextPage: hasNextPage
        };
    }

    async getLatestUpdates(page) {

        if (page === 1) {
            this._seenUrls = new Set();
            this._seenTitles = new Set();
        }

        let url;

        if (page === 1) {
            url =
                this.source.baseUrl +
                "/anime/?status=&type=&order=update";
        } else {
            url =
                this.source.baseUrl +
                "/anime/page/" +
                page +
                "/?status=&type=&order=update";
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
            this.buildList(animeLinks, "");

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
                        /\/anime\/page\/(\d+)\/?/
                    );

                if (
                    match &&
                    parseInt(match[1], 10) > page
                ) {
                    hasNextPage = true;
                    break;
                }
            }
        }

        return {
            list: result.list,
            hasNextPage: hasNextPage
        };
    }

    async search(query, page, filters) {

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
                encoded +
                "&post_type=anime";
        } else {
            url =
                this.source.baseUrl +
                "/page/" +
                page +
                "/?s=" +
                encoded +
                "&post_type=anime";
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
            this.buildList(animeLinks, query);

        let hasNextPage = false;

        if (result.newCount > 0) {

            const pageLinks =
                document.select(
                    'a[href*="/page/"]'
                );

            for (const link of pageLinks) {

                const href =
                    link.attr("href") || "";

                const match =
                    href.match(
                        /\/page\/(\d+)\//
                    );

                if (
                    match &&
                    parseInt(match[1], 10) > page
                ) {
                    hasNextPage = true;
                    break;
                }
            }
        }

        return {
            list: result.list,
            hasNextPage: hasNextPage
        };
    }

    async getSearch(query, page, filters) {
        return await this.search(
            query,
            page,
            filters
        );
    }

    async getDetail(url) {

        const response =
            await this.client.get(url);

        const document =
            new Document(response.body);

        let title = "";

        const titleElement =
            document.selectFirst("h1");

        if (titleElement) {
            title =
                titleElement.text.trim();
        }

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

                dateUpload:
                    null
            });
        }

        episodes.sort(
            (a, b) => {

                const aMatch =
                    a.name.match(/\d+/);

                const bMatch =
                    b.name.match(/\d+/);

                const aNumber =
                    aMatch
                        ? parseInt(aMatch[0])
                        : 0;

                const bNumber =
                    bMatch
                        ? parseInt(bMatch[0])
                        : 0;

                return bNumber - aNumber;
            }
        );

        return {
            url: url,
            title: title,
            imageUrl: imageUrl,
            description: description,
            author: "",
            genre: genres,
            status: 0,
            episodes: episodes
        };
    }

    async getVideoList(url) {

        const response =
            await this.client.get(url);

        const document =
            new Document(response.body);

        const iframes =
            document.select("iframe");

        if (iframes.length === 0) {
            return [];
        }

        const videos = [];
        const seenVideos = new Set();

        for (const iframe of iframes) {

            let iframeUrl =
                iframe.attr("data-src") ||
                iframe.attr("data-lazy-src") ||
                iframe.attr("src") ||
                "";

            iframeUrl = iframeUrl.trim();

            if (!iframeUrl) {
                continue;
            }

            if (iframeUrl === "about:blank") {
                continue;
            }

            if (iframeUrl.startsWith("data:")) {
                continue;
            }

            iframeUrl =
                this.makeAbsoluteUrl(iframeUrl);

            if (
                iframeUrl.includes(".m3u8") ||
                iframeUrl.includes(".mp4")
            ) {

                if (!seenVideos.has(iframeUrl)) {

                    seenVideos.add(iframeUrl);

                    videos.push({
                        url: iframeUrl,
                        originalUrl: iframeUrl,
                        quality: "default",
                        headers: {
                            "Referer":
                                this.source.baseUrl,
                            "User-Agent":
                                "Mozilla/5.0"
                        }
                    });
                }

                continue;
            }

            try {

                const iframeResponse =
                    await this.client.get(iframeUrl);

                const videoUrl =
                    this.findVideoUrl(
                        iframeResponse.body
                    );

                if (!videoUrl) {
                    continue;
                }

                const absoluteVideoUrl =
                    this.makeAbsoluteUrl(videoUrl);

                if (
                    seenVideos.has(
                        absoluteVideoUrl
                    )
                ) {
                    continue;
                }

                seenVideos.add(absoluteVideoUrl);

                videos.push({
                    url: absoluteVideoUrl,
                    originalUrl: absoluteVideoUrl,
                    quality: "default",
                    headers: {
                        "Referer": iframeUrl,
                        "User-Agent":
                            "Mozilla/5.0"
                    }
                });

            } catch (e) {
                continue;
            }
        }

        return videos;
    }

    findVideoUrl(html) {

        if (!html) {
            return "";
        }

        const markers = [
            "file:",
            "source:",
            "src:"
        ];

        for (const marker of markers) {

            let index =
                html.indexOf(marker);

            while (index !== -1) {

                const after =
                    html.substring(
                        index + marker.length,
                        index + marker.length + 500
                    );

                const found =
                    this.pullUrl(after);

                if (found) {
                    return found;
                }

                index = html.indexOf(
                    marker,
                    index + marker.length
                );
            }
        }

        const direct =
            this.pullUrl(html);

        return direct;
    }

    pullUrl(text) {

        if (!text) {
            return "";
        }

        const start =
            text.search(/https?:\/\//);

        if (start === -1) {
            return "";
        }

        let end = start;

        while (end < text.length) {

            const c = text[end];

            if (
                c === '"' ||
                c === "'" ||
                c === " " ||
                c === "\n" ||
                c === "\r" ||
                c === "\t" ||
                c === "\\" ||
                c === ")"
            ) {
                break;
            }

            end++;
        }

        const url =
            text.substring(start, end);

        if (
            url.includes(".m3u8") ||
            url.includes(".mp4")
        ) {
            return url;
        }

        return "";
    }

}
