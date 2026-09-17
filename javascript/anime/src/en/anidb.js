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
        "version": "0.1.8",
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

    async getPopular(page) {

        const pageUrl =
            page > 1
                ? this.source.baseUrl + "/?page=" + page
                : this.source.baseUrl;

        const response =
            await this.client.get(pageUrl);

        const document =
            new Document(response.body);

        const animeLinks =
            document.select('a[href*="/anime/"]');

        const list = [];
        const seen = new Set();

        for (const element of animeLinks) {

            const href =
                element.attr("href");

            if (!href) {
                continue;
            }

            const url =
                this.makeAbsoluteUrl(href);
            const href =
    element.attr("href");

if (!href) {
    continue;
}

const url =
    this.makeAbsoluteUrl(href);

/*
 * Ignore AniDB's "View All" archive link.
 */

if (
    url === this.source.baseUrl + "/anime/" ||
    url === this.source.baseUrl + "/anime"
) {
    continue;
}

            if (seen.has(url)) {
                continue;
            }

            const title =
                element.text.trim();

            if (!title) {
                continue;
            }

            seen.add(url);

            let imageUrl = "";

            const image =
                element.selectFirst("img");

            if (image) {

                let src =
                    image.attr("src");

                if (!src) {
                    src =
                        image.attr("data-src");
                }

                if (src) {
                    imageUrl =
                        this.makeAbsoluteUrl(src);
                }
            }

            list.push({
                name: title,
                url: url,
                link: url,
                imageUrl: imageUrl
            });
        }

        return {
            list: list,
            hasNextPage: list.length > 0
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

        /*
         * Fallback in case the cover image
         * is not inside an image link.
         */

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

            /*
             * Ignore comment form text.
             */

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

            /*
             * Ignore very short paragraphs.
             */

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

        /*
         * Get the exact anime slug
         * from the detail page URL.
         *
         * Example:
         *
         * /anime/
         * bleach-thousand-year-blood-war-the-calamity/
         */

        let animeSlug = "";

        const animeMatch =
            url.match(
                /\/anime\/([^\/?#]+)/
            );

        if (animeMatch) {
            animeSlug =
                animeMatch[1];
        }

        /*
         * Only episode URLs belonging
         * to this exact anime will be used.
         */

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

            /*
             * Convert absolute AniDB URLs
             * into relative paths so the
             * prefix check works consistently.
             */

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

            /*
             * Remove query parameters.
             */

            href =
                href.split("?")[0];

            /*
             * Remove fragments.
             */

            href =
                href.split("#")[0];

            /*
             * Make sure this is an episode
             * of the current anime.
             */

            if (
                !href.startsWith(
                    episodePrefix
                )
            ) {
                continue;
            }

            /*
             * Extract episode number.
             */

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

            /*
             * Prevent duplicates.
             */

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

        /* -------------------------
           SORT EPISODES
           NEWEST FIRST
        ------------------------- */

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

        /* -------------------------
           RETURN DETAIL
        ------------------------- */

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
