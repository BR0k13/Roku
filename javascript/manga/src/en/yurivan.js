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
        "version": "0.1.3",
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

    getSortParam(sortIndex) {

        const SORT_PARAMS = [
            "",
            "sort=fresh",
            "sort=top-rated"
        ];

        return SORT_PARAMS[sortIndex] || "";
    }

    buildListUrl(page, sortParam) {

        const params = [];

        if (sortParam) {
            params.push(sortParam);
        }

        if (page > 1) {
            params.push("page=" + page);
        }

        const query = params.length > 0
            ? "?" + params.join("&")
            : "";

        return this.source.baseUrl + query;
    }

    async fetchList(page, sortParam) {

        const pageUrl = this.buildListUrl(page, sortParam);

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

    async getPopular(page) {
        return await this.fetchList(page, this.getSortParam(0));
    }

    async getLatestUpdates(page) {
        return await this.fetchList(page, this.getSortParam(1));
    }

    async search(query, page, filters) {

        let sortIndex = 0;

        if (filters && filters.length > 0) {

            for (const filter of filters) {

                if (
                    filter.state &&
                    typeof filter.state.index === "number"
                ) {
                    sortIndex = filter.state.index;
                }
            }
        }

        return await this.fetchList(
            page,
            this.getSortParam(sortIndex)
        );
    }

    async getDetail(url) {

        const absoluteUrl =
            this.makeAbsoluteUrl(url);

        const response = await this.client.get(
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
            document.select('a[href*="/creator/"]');

        if (creatorLinks.length > 0) {

            manga.author =
                creatorLinks[0].text.trim();
        }

        // TAGS

        const tagLinks =
            document.select('a[href*="/tag/"]');

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

        const seenChapterNumbers = new Set();

        for (const chapterLink of chapterLinks) {

            const chapterUrl =
                chapterLink.attr("href");

            if (!chapterUrl) {
                continue;
            }

            const linkText =
                chapterLink.text.trim().toLowerCase().replace(/\s+/g, " ");

            if (
                linkText.includes("start reading") ||
                linkText.includes("bonus book")
            ) {
                continue;
            }

            const match =
                chapterUrl.match(/chapter=([0-9]+)/);

            if (!match) {
                continue;
            }

            const chapterNumber =
                match[1];

            if (seenChapterNumbers.has(chapterNumber)) {
                continue;
            }

            seenChapterNumbers.add(chapterNumber);

            manga.chapters.push({
                name: "Chapter " + chapterNumber,
                url: this.makeAbsoluteUrl(chapterUrl)
            });
        }

        return manga;
    }

    async getPageList(url) {

        const readerUrl =
            this.makeAbsoluteUrl(url);

        const response =
            await this.client.get(
                readerUrl,
                this.getHeaders(readerUrl)
            );

        const document =
            new Document(response.body);

        const links =
            document.select("a");

        const images =
            document.select("img");

        const pages = [];

        for (const element of links) {

            const href =
                element.attr("href");

            if (
                href &&
                href.includes("img.yurivan.com")
            ) {

                const imageUrl =
                    this.makeAbsoluteUrl(href);

                if (!pages.includes(imageUrl)) {
                    pages.push(imageUrl);
                }
            }
        }

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

                    const imageUrl =
                        this.makeAbsoluteUrl(src);

                    if (!pages.includes(imageUrl)) {
                        pages.push(imageUrl);
                    }
                }
            }
        }

        return pages;
    }

    getFilterList() {
        return [];
    }

    getSourcePreferences() {
        return [];
    }
}
