const mangayomiSources = [
    {
        "name": "Yurivan",
        "lang": "en",
        "baseUrl": "https://www.yurivan.com",
        "apiUrl": "",
        "iconUrl": "https://www.yurivan.com/favicon.ico",
        "typeSource": "single",
        "itemType": 0,
        "isNsfw": true,
        "version": "0.1.2",
        "pkgPath": "manga/src/en/yurivan.js",
        "notes": "Yurivan manga source"
    }
];

class DefaultExtension extends MProvider {

    constructor() {
        super();
        this.client = new Client();
    }

    getHeaders(url) {
        return {
            "Referer": url
        };
    }

    makeAbsoluteUrl(url) {
        if (!url) return "";

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

        const pageUrl = page > 1
            ? this.source.baseUrl + "/?page=" + page
            : this.source.baseUrl;

        const response = await this.client.get(
            pageUrl,
            this.getHeaders(pageUrl)
        );

        const document = new Document(response.body);

        const storyLinks =
            document.select('a[href*="/story/"]');

        const allImages =
            document.select("img");

        const imageLinks = [];

        for (const image of allImages) {

            let src = image.attr("src");

            if (!src) {
                src = image.attr("data-src");
            }

            if (!src) {
                src = image.attr("data-lazy-src");
            }

            if (
                src &&
                src.includes("img.yurivan.com")
            ) {
                imageLinks.push(
                    this.makeAbsoluteUrl(src)
                );
            }
        }

        const list = [];

        for (let i = 0; i < storyLinks.length; i++) {

            const element = storyLinks[i];

            const href = element.attr("href");
            const title = element.text.trim();

            if (!href || !title) {
                continue;
            }

            let imageUrl = "";

            if (i < imageLinks.length) {
                imageUrl = imageLinks[i];
            }

            list.push({
                name: title,
                url: this.makeAbsoluteUrl(href),
                link: this.makeAbsoluteUrl(href),
                imageUrl: imageUrl
            });
        }

        return {
            list: list,
            hasNextPage: list.length > 0
        };
    }

    async getLatestUpdates(page) {
        return await this.getPopular(page);
    }

    async search(query, page, filters) {
        return await this.getPopular(page);
    }

    async getDetail(url) {

        const absoluteUrl =
            this.makeAbsoluteUrl(url);

        const response =
            await this.client.get(
                absoluteUrl,
                this.getHeaders(absoluteUrl)
            );

        const document =
            new Document(response.body);

        const manga = {
            name: "",
            link: absoluteUrl,
            description: "",
            imageUrl: "",
            author: "",
            artist: "",
            genre: [],
            status: 5,
            chapters: []
        };

        // TITLE

        const titleElement =
            document.selectFirst("h1");

        if (titleElement) {
            manga.name =
                titleElement.text.trim();
        }

        // COVER

        const allLinks =
            document.select("a");

        for (const element of allLinks) {

            const href =
                element.attr("href");

            if (
                href &&
                href.includes("img.yurivan.com")
            ) {
                manga.imageUrl =
                    this.makeAbsoluteUrl(href);

                break;
            }
        }

        // DESCRIPTION

        const paragraphs =
            document.select("p");

        for (const paragraph of paragraphs) {

            const text =
                paragraph.text.trim();

            if (
                text &&
                text.length > 30 &&
                !text.includes("Create a Free Account")
            ) {

                if (!manga.description) {
                    manga.description = text;
                }
            }
        }

        // AUTHOR

        const creatorLinks =
            document.select(
                'a[href*="/creator/"]'
            );

        if (creatorLinks.length > 0) {

            manga.author =
                creatorLinks[0].text.trim();
        }

        // TAGS

        const tagLinks =
            document.select(
                'a[href*="/tag/"]'
            );

        for (const tag of tagLinks) {

            const tagName =
                tag.text.trim();

            if (
                tagName &&
                !manga.genre.includes(tagName)
            ) {
                manga.genre.push(tagName);
            }
        }

        // CHAPTERS

        const chapterLinks =
            document.select("a");

        for (const chapterLink of chapterLinks) {

            const chapterUrl =
                chapterLink.attr("href");

            if (
                !chapterUrl ||
                !chapterUrl.includes("/read")
            ) {
                continue;
            }

            /*
             * ONLY ACCEPT REAL CHAPTER LINKS
             *
             * Yurivan also has links such as:
             * Start Reading
             * Bonus Book: Ravishing Elichi
             *
             * Those don't contain chapter=N,
             * so we ignore them.
             */

            const match =
                chapterUrl.match(
                    /[?&]chapter=([0-9]+)/
                );

            if (!match) {
                continue;
            }

            const chapterNumber =
                match[1];

            const chapterName =
                "Chapter " + chapterNumber;

            const finalUrl =
                this.makeAbsoluteUrl(
                    chapterUrl
                );

            // Prevent duplicate chapters

            let duplicate = false;

            for (const existing of manga.chapters) {

                if (existing.url === finalUrl) {
                    duplicate = true;
                    break;
                }
            }

            if (duplicate) {
                continue;
            }

            manga.chapters.push({
                name: chapterName,
                url: finalUrl
            });
        }

        return manga;
    }

    async getPageList(url) {

        const readerUrl =
            this.makeAbsoluteUrl(url);

        console.log(
            "=== YURIVAN PAGE TEST ==="
        );

        console.log(
            "READER URL: " + readerUrl
        );

        const response =
            await this.client.get(
                readerUrl,
                this.getHeaders(readerUrl)
            );

        console.log(
            "HTML LENGTH: " +
            response.body.length
        );

        const document =
            new Document(response.body);

        const links =
            document.select("a");

        const images =
            document.select("img");

        console.log(
            "TOTAL LINKS: " +
            links.length
        );

        console.log(
            "TOTAL IMAGES: " +
            images.length
        );

        const pages = [];

        // IMAGE LINKS

        for (const element of links) {

            const href =
                element.attr("href");

            if (
                href &&
                href.includes("img.yurivan.com")
            ) {

                console.log(
                    "FOUND IMAGE LINK: " +
                    href
                );

                const imageUrl =
                    this.makeAbsoluteUrl(href);

                if (!pages.includes(imageUrl)) {
                    pages.push(imageUrl);
                }
            }
        }

        console.log(
            "PAGES FROM LINKS: " +
            pages.length
        );

        // IMAGE SRC FALLBACK

        if (pages.length === 0) {

            for (const element of images) {

                let src =
                    element.attr("src");

                if (!src) {
                    src =
                        element.attr("data-src");
                }

                if (!src) {
                    src =
                        element.attr("data-lazy-src");
                }

                if (
                    src &&
                    src.includes("img.yurivan.com")
                ) {

                    console.log(
                        "FOUND IMAGE SRC: " +
                        src
                    );

                    const imageUrl =
                        this.makeAbsoluteUrl(src);

                    if (!pages.includes(imageUrl)) {
                        pages.push(imageUrl);
                    }
                }
            }
        }

        console.log(
            "FINAL PAGE COUNT: " +
            pages.length
        );

        return pages;
    }

    getFilterList() {
        return [];
    }

    getSourcePreferences() {
        return [];
    }
}
