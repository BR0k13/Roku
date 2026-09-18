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
        "version": "0.2.5",
        "pkgPath": "anime/src/en/anidb.js",
        "notes": "AniDB anime source"
    }
];

class DefaultExtension extends MProvider {

    constructor() {
        super();
        this.client = new Client();
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

    /*
     * Normalize a URL for duplicate detection.
     * Strips the query string, fragments, and any
     * trailing slash so that "/anime/bleach/" and
     * "/anime/bleach" collapse into the same key.
     */
    normalizeUrl(url) {

        if (!url) {
            return "";
        }

        let normalized =
            url.split("?")[0].split("#")[0];

        /*
         * Collapse trailing slashes.
         */
        normalized =
            normalized.replace(/\/+$/, "");

        /*
         * Lowercase for case-insensitive comparison.
         */
        normalized =
            normalized.toLowerCase();

        return normalized;
    }

    /*
     * Try to extract a clean anime title from a
     * card link. Handles the common WordPress
     * anime-theme markup variants.
     */
    extractTitle(element) {

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

        return text;
    }

    async getPopular(page) {

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

        const list = [];
        const seenUrls = new Set();
        const seenTitles = new Set();

        for (const element of animeLinks) {

            let href =
                element.attr("href");

            if (!href) {
                continue;
            }

            const cleanHref =
                href.split("?")[0].split("#")[0];

            /*
             * Skip the archive root itself.
             */

            if (
                /\/anime\/?$/.test(cleanHref)
            ) {
                continue;
            }

            /*
             * Skip pagination links.
             */

            if (
                /\/anime\/page\/\d+\/?$/.test(
                    cleanHref
                )
            ) {
                continue;
            }

            /*
             * Only accept links that contain an
             * <img> — these are the real anime
             * cards.
             */

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

            /*
             * Normalize before deduping so that
             * "/anime/bleach/" and "/anime/bleach"
             * are treated as the same entry.
             */

            const urlKey =
                this.normalizeUrl(absoluteUrl);

            if (seenUrls.has(urlKey)) {
                continue;
            }

            const title =
                this.extractTitle(element);

            if (!title || title.length < 2) {
                continue;
            }

            if (
                title.toLowerCase().includes("view all")
            ) {
                continue;
            }

            /*
             * Secondary dedupe by title (catches
             * cases where two different URLs point
             * to the same anime, e.g. a featured
             * widget linking to a variant path).
             */

            const titleKey =
                title.toLowerCase().trim();

            if (seenTitles.has(titleKey)) {
                continue;
            }

            seenUrls.add(urlKey);
            seenTitles.add(titleKey);

            let imageUrl = "";

            const src =
                img.attr("src") ||
                img.attr("data-src");

            if (src) {
                imageUrl =
                    this.makeAbsoluteUrl(src);
            }

            list.push({
                name: title,
                url: absoluteUrl,
                link: absoluteUrl,
                imageUrl: imageUrl
            });
        }

        let hasNextPage = false;

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

        return {
            list: list,
            hasNextPage: hasNextPage
        };
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

}
