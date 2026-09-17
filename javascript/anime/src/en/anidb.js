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
        "version": "0.1.5",
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

        /* -------------------------
           SYNOPSIS
        ------------------------- */

        let description = "";

        const synopsis =
            document.selectFirst(
                "h2 + p"
            );

        if (synopsis) {
            description =
                synopsis.text.trim();
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
         * Get the anime slug from the
         * current detail URL.
         *
         * Example:
         * /anime/bleach-thousand-year...
         */

        let animeSlug = "";

        const animeMatch =
            url.match(
                /\/anime\/([^\/]+)/
            );

        if (animeMatch) {
            animeSlug =
                animeMatch[1];
        }

        const episodeLinks =
            document.select(
                'a[href*="-episode-"]'
            );

        for (const element of episodeLinks) {

            const href =
                element.attr("href");

            if (!href) {
                continue;
            }

            const episodeUrl =
                this.makeAbsoluteUrl(href);

            if (
                seenEpisodes.has(
                    episodeUrl
                )
            ) {
                continue;
            }

            /*
             * Only accept episode links
             * belonging to THIS anime.
             *
             * This prevents things like:
             * Red River Episode 11
             * Liar Game Episode 24
             * etc. from being included.
             */

            const episodeMatch =
                episodeUrl.match(
                    /\/([^\/]+)-episode-(\d+)(?:-[^\/]+)?\/?$/
                );

            if (!episodeMatch) {
                continue;
            }

            const episodeAnimeSlug =
                episodeMatch[1];

            if (
                animeSlug &&
                episodeAnimeSlug !== animeSlug
            ) {
                continue;
            }

            const episodeNumber =
                episodeMatch[2];

            /*
             * Build a clean episode name
             * from the URL instead of taking
             * the entire nested anchor text.
             */

            let episodeName =
                "Episode " +
                episodeNumber;

            const suffixMatch =
                episodeUrl.match(
                    /-episode-\d+-(.+?)(?:\/)?$/
                );

            if (suffixMatch) {

                const suffix =
                    suffixMatch[1]
                        .replace(
                            /\/$/,
                            ""
                        )
                        .replace(
                            /-/g,
                            " "
                        )
                        .trim();

                if (suffix) {

                    episodeName =
                        "Episode " +
                        episodeNumber +
                        " " +
                        suffix;
                }
            }

            seenEpisodes.add(
                episodeUrl
            );

            episodes.push({
                name: episodeName,
                url: episodeUrl,
                scanlator: "",
                dateUpload: null
            });
        }

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
