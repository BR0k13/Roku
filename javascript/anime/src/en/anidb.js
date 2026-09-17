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
        "version": "0.1.2",
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

        let title = "";

        const titleElement =
            document.selectFirst("h1");

        if (titleElement) {
            title = titleElement.text.trim();
        }

        let description = "";

        const descriptionElement =
            document.selectFirst(
                '[class*="description"], [class*="synopsis"]'
            );

        if (descriptionElement) {
            description =
                descriptionElement.text.trim();
        }

        const genres = [];

        const genreElements =
            document.select(
                'a[href*="genre"], a[href*="genres"]'
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

        const episodeLinks =
            document.select(
                'a[href*="/episode"]'
            );

        const seenEpisodes = new Set();

        for (const element of episodeLinks) {

            const href =
                element.attr("href");

            if (!href) {
                continue;
            }

            const episodeUrl =
                this.makeAbsoluteUrl(href);

            if (seenEpisodes.has(episodeUrl)) {
                continue;
            }

            const episodeName =
                element.text.trim();

            if (!episodeName) {
                continue;
            }

            seenEpisodes.add(episodeUrl);

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
            description: description,
            author: "",
            genre: genres,
            status: 5,
            episodes: episodes
        };
    }
}
