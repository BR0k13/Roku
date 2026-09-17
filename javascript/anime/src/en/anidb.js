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
        "version": "0.1.0",
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

}
