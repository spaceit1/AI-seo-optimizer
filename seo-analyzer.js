/**
 * Analizator SEO - skrypt do kompleksowej analizy strony pod kątem SEO
 *
 * Funkcjonalności:
 * - Crawlowanie wszystkich dostępnych linków na stronie
 * - Analiza powiązań między stronami
 * - Sprawdzanie pliku sitemap.xml
 * - Generowanie raportu z analizy
 */

const axios = require("axios");
const cheerio = require("cheerio");
const { parseString } = require("xml2js");
const fs = require("fs");
const url = require("url");
const path = require("path");
const puppeteer = require("puppeteer");
const SEOAIOptimizer = require("./seo-ai-optimizer");
const config = require("./config");
require("dotenv").config();

class SEOAnalyzer {
   constructor(startUrl, openaiApiKey) {
      this.startUrl = startUrl;
      this.baseUrl = this.getBaseUrl(startUrl);
      this.visitedUrls = new Set();
      this.staticResources = new Set(); // Nowa kolekcja dla zasobów statycznych
      this.brokenLinks = [];
      this.internalLinks = new Map(); // URL -> [links to]
      this.externalLinks = new Map(); // URL -> [external links]
      this.pagesTitles = new Map(); // URL -> title
      this.pagesDescriptions = new Map(); // URL -> description
      this.pagesH1 = new Map(); // URL -> h1
      this.sitemapUrls = new Set();
      this.urlsNotInSitemap = new Set();
      this.urlsInSitemapButNotCrawled = new Set();
      this.statusCodes = new Map(); // URL -> status code
      this.pagesTitlesWarnings = new Map();
      this.pagesDescriptionsWarnings = new Map();
      this.pagesMetaTags = new Map();
      this.aiOptimizer = new SEOAIOptimizer(openaiApiKey);
      this.keywords = new Set(config.seo.keywords);
   }

   getBaseUrl(inputUrl) {
      const parsedUrl = new URL(inputUrl);
      return `${parsedUrl.protocol}//${parsedUrl.hostname}`;
   }

   isInternalUrl(link) {
      if (link.startsWith("/")) return true;
      if (link.startsWith(this.baseUrl)) return true;
      return false;
   }

   normalizeUrl(link, currentUrl) {
      if (link.startsWith("/")) {
         return new URL(link, this.baseUrl).href;
      }
      if (!link.startsWith("http")) {
         return new URL(link, currentUrl).href;
      }
      return link;
   }

   shouldCrawl(url) {
      const ignoreExtensions = [
         ".jpg",
         ".jpeg",
         ".png",
         ".gif",
         ".pdf",
         ".doc",
         ".zip",
         ".css",
         ".js",
         ".webp",
         ".svg",
         ".ico",
         ".woff",
         ".woff2",
         ".ttf",
         ".eot",
      ];

      const isStaticResource = ignoreExtensions.some((ext) =>
         url.toLowerCase().endsWith(ext)
      );
      if (isStaticResource) {
         this.staticResources.add(url);
         return false;
      }
      return true;
   }

   async fetchPage(url) {
      try {
         const response = await axios.get(url, {
            maxRedirects: 5,
            timeout: 10000,
            headers: {
               "User-Agent": "SEOAnalyzer/1.0",
            },
         });
         this.statusCodes.set(url, response.status);
         return { html: response.data, status: response.status };
      } catch (error) {
         if (error.response) {
            this.statusCodes.set(url, error.response.status);
            this.brokenLinks.push({ url, status: error.response.status });
            return { html: "", status: error.response.status };
         } else {
            this.statusCodes.set(url, 0);
            this.brokenLinks.push({ url, status: 0, error: error.message });
            return { html: "", status: 0 };
         }
      }
   }

   async extractMetadata($, url) {
      // Pobierz tytuł strony
      const title = $("title").text().trim();
      if (title) {
         this.pagesTitles.set(url, title);
         // Sprawdź długość tytułu
         if (title.length < 30 || title.length > 60) {
            this.pagesTitlesWarnings = this.pagesTitlesWarnings || new Map();
            this.pagesTitlesWarnings.set(url, title.length);
         }
      }

      // Pobierz opis strony
      const description = $('meta[name="description"]').attr("content");
      if (description) {
         this.pagesDescriptions.set(url, description);
         // Sprawdź długość opisu
         if (description.length < 120 || description.length > 160) {
            this.pagesDescriptionsWarnings =
               this.pagesDescriptionsWarnings || new Map();
            this.pagesDescriptionsWarnings.set(url, description.length);
         }
      }

      // Pobierz wszystkie meta tagi
      const metaTags = {};
      $("meta").each((_, element) => {
         const name = $(element).attr("name") || $(element).attr("property");
         const content = $(element).attr("content");
         if (name && content) {
            metaTags[name] = content;
         }
      });
      this.pagesMetaTags = this.pagesMetaTags || new Map();
      this.pagesMetaTags.set(url, metaTags);

      // Pobierz nagłówek H1
      const h1 = $("h1").first().text().trim();
      if (h1) {
         this.pagesH1.set(url, h1);
      }

      // Optymalizacja AI
      if (title || description) {
         try {
            const pageData = {
               title: title || "",
               description: description || "",
               keywords: Array.from(this.keywords),
            };

            const optimizedData = await this.aiOptimizer.optimizeMetaTags(
               pageData
            );

            // Dodaj sugestie optymalizacji do raportu
            this.pagesMetaTags.get(url).aiSuggestions = {
               optimizedTitle: optimizedData.title,
               optimizedDescription: optimizedData.description,
               keywordSuggestions: optimizedData.suggestions,
            };
         } catch (error) {
            console.error(`Błąd podczas optymalizacji AI dla ${url}:`, error);
         }
      }
   }

   extractLinks($, currentUrl) {
      const links = new Set();
      const currentInternalLinks = [];
      const currentExternalLinks = [];

      $("a").each((_, element) => {
         const href = $(element).attr("href");
         if (!href) return;

         // Ignoruj linki kotwicowe i javascript
         if (
            href.startsWith("#") ||
            href.startsWith("javascript:") ||
            href.startsWith("mailto:") ||
            href.startsWith("tel:")
         ) {
            return;
         }

         try {
            const normalizedUrl = this.normalizeUrl(href, currentUrl);
            links.add(normalizedUrl);

            if (this.isInternalUrl(href)) {
               currentInternalLinks.push(normalizedUrl);
            } else {
               currentExternalLinks.push(normalizedUrl);
            }
         } catch (error) {
            console.warn(`Nieprawidłowy URL: ${href} na stronie ${currentUrl}`);
         }
      });

      this.internalLinks.set(currentUrl, currentInternalLinks);
      this.externalLinks.set(currentUrl, currentExternalLinks);

      return links;
   }

   async extractContent($) {
      // Usuń skrypty, style i komentarze
      $("script, style, comment").remove();

      // Pobierz tekst z głównych sekcji
      const content = {
         title: $("title").text().trim(),
         h1: $("h1")
            .map((_, el) => $(el).text().trim())
            .get(),
         h2: $("h2")
            .map((_, el) => $(el).text().trim())
            .get(),
         h3: $("h3")
            .map((_, el) => $(el).text().trim())
            .get(),
         paragraphs: $("p")
            .map((_, el) => $(el).text().trim())
            .get(),
         lists: $("ul, ol")
            .map((_, el) => $(el).text().trim())
            .get(),
         metaDescription: $('meta[name="description"]').attr("content") || "",
         metaKeywords: $('meta[name="keywords"]').attr("content") || "",
      };

      return content;
   }

   async analyzePage(url, $) {
      try {
         const content = await this.extractContent($);
         if (!content) {
            console.error(`Nie udało się wyodrębnić treści dla ${url}`);
            return null;
         }

         const pageAnalysis = await this.aiOptimizer.analyzePageContent(
            JSON.stringify(content),
            url
         );
         if (!pageAnalysis) {
            console.error(`Nie udało się przeanalizować treści dla ${url}`);
            return null;
         }

         // Upewnij się, że metaTags istnieje
         if (!this.pagesMetaTags.has(url)) {
            this.pagesMetaTags.set(url, {});
         }

         // Dodaj analizę do raportu
         const metaTags = this.pagesMetaTags.get(url);
         metaTags.contentAnalysis = pageAnalysis;
         this.pagesMetaTags.set(url, metaTags);

         // Aktualizuj słowa kluczowe na podstawie analizy AI
         if (
            pageAnalysis.mainKeywords &&
            Array.isArray(pageAnalysis.mainKeywords)
         ) {
            pageAnalysis.mainKeywords.forEach((keyword) =>
               this.keywords.add(keyword)
            );
         }
         if (
            pageAnalysis.longTailKeywords &&
            Array.isArray(pageAnalysis.longTailKeywords)
         ) {
            pageAnalysis.longTailKeywords.forEach((keyword) =>
               this.keywords.add(keyword)
            );
         }

         return pageAnalysis;
      } catch (error) {
         console.error(`Błąd podczas analizy strony ${url}:`, error);
         return null;
      }
   }

   async crawl(url, depth = 0, maxDepth = 10) {
      if (
         depth > maxDepth ||
         this.visitedUrls.has(url) ||
         !this.shouldCrawl(url)
      ) {
         return;
      }

      console.log(`Crawlowanie: ${url} (głębokość: ${depth})`);
      this.visitedUrls.add(url);

      const { html, status } = await this.fetchPage(url);
      if (status !== 200 || !html) return;

      const $ = cheerio.load(html);

      // Najpierw analizujemy treść strony przez AI
      await this.analyzePage(url, $);

      // Następnie pobieramy metadane
      await this.extractMetadata($, url);

      // Na końcu zbieramy linki
      const links = this.extractLinks($, url);

      for (const link of links) {
         if (this.isInternalUrl(link)) {
            await this.crawl(link, depth + 1, maxDepth);
         }
      }
   }

   async fetchSitemap() {
      try {
         const sitemapUrl = `${this.baseUrl}/sitemap.xml`;
         console.log(`Pobieranie sitemap z: ${sitemapUrl}`);

         const response = await axios.get(sitemapUrl, {
            timeout: 10000,
            headers: {
               "User-Agent": "SEOAnalyzer/1.0",
            },
         });

         return response.data;
      } catch (error) {
         console.error(`Błąd podczas pobierania sitemap: ${error.message}`);
         return null;
      }
   }

   async parseSitemap(sitemapXml) {
      return new Promise((resolve, reject) => {
         parseString(sitemapXml, (err, result) => {
            if (err) {
               reject(err);
               return;
            }

            try {
               if (result.sitemapindex) {
                  // To jest indeks sitemapów
                  console.log("Wykryto indeks sitemapów, przetwarzanie...");
                  resolve(this.processSitemapIndex(result.sitemapindex));
               } else if (result.urlset) {
                  // To jest standardowy sitemap
                  this.processSitemap(result.urlset);
                  resolve();
               } else {
                  console.error("Nieprawidłowy format sitemap");
                  reject(new Error("Nieprawidłowy format sitemap"));
               }
            } catch (error) {
               reject(error);
            }
         });
      });
   }

   async processSitemapIndex(sitemapindex) {
      if (!sitemapindex.sitemap) return;

      for (const sitemap of sitemapindex.sitemap) {
         try {
            const sitemapUrl = sitemap.loc[0];
            console.log(`Pobieranie sub-sitemap: ${sitemapUrl}`);

            const response = await axios.get(sitemapUrl, {
               timeout: 10000,
               headers: {
                  "User-Agent": "SEOAnalyzer/1.0",
               },
            });

            await this.parseSitemap(response.data);
         } catch (error) {
            console.error(
               `Błąd podczas przetwarzania sub-sitemap: ${error.message}`
            );
         }
      }
   }

   processSitemap(urlset) {
      if (!urlset.url) return;

      for (const item of urlset.url) {
         const url = item.loc[0];
         this.sitemapUrls.add(url);
      }

      console.log(`Dodano ${urlset.url.length} URL-i z sitemap`);
   }

   compareCrawlWithSitemap() {
      // Znajdź URL-e, które zostały scrawlowane, ale nie ma ich w sitemap
      for (const crawledUrl of this.visitedUrls) {
         if (!this.sitemapUrls.has(crawledUrl)) {
            this.urlsNotInSitemap.add(crawledUrl);
         }
      }

      // Znajdź URL-e, które są w sitemap, ale nie zostały scrawlowane
      for (const sitemapUrl of this.sitemapUrls) {
         if (!this.visitedUrls.has(sitemapUrl)) {
            this.urlsInSitemapButNotCrawled.add(sitemapUrl);
         }
      }
   }

   generateReport() {
      const report = {
         baseUrl: this.baseUrl,
         dateGenerated: new Date().toISOString(),
         issues: [],
         crawlStats: {
            totalUrlsCrawled: this.visitedUrls.size,
            totalStaticResources: this.staticResources.size,
            brokenLinks: this.brokenLinks.length,
            totalInternalLinks: [...this.internalLinks.values()].flat().length,
            totalExternalLinks: [...this.externalLinks.values()].flat().length,
            urlsWithoutTitle: [...this.visitedUrls].filter(
               (url) => !this.pagesTitles.has(url)
            ),
            urlsWithoutDescription: [...this.visitedUrls].filter(
               (url) => !this.pagesDescriptions.has(url)
            ),
            urlsWithoutH1: [...this.visitedUrls].filter(
               (url) => !this.pagesH1.has(url)
            ),
            urlsWithInvalidTitleLength: this.pagesTitlesWarnings
               ? [...this.pagesTitlesWarnings.entries()]
               : [],
            urlsWithInvalidDescriptionLength: this.pagesDescriptionsWarnings
               ? [...this.pagesDescriptionsWarnings.entries()]
               : [],
         },
         sitemapStats: {
            totalUrlsInSitemap: this.sitemapUrls.size,
            urlsNotInSitemap: [...this.urlsNotInSitemap],
            urlsInSitemapButNotCrawled: [...this.urlsInSitemapButNotCrawled],
         },
         brokenLinks: this.brokenLinks,
         pageMeta: [...this.visitedUrls].map((url) => ({
            url,
            status: this.statusCodes.get(url) || "unknown",
            title: this.pagesTitles.get(url) || "",
            titleLength: this.pagesTitles.get(url)?.length || 0,
            description: this.pagesDescriptions.get(url) || "",
            descriptionLength: this.pagesDescriptions.get(url)?.length || 0,
            h1: this.pagesH1.get(url) || "",
            internalLinksCount: (this.internalLinks.get(url) || []).length,
            externalLinksCount: (this.externalLinks.get(url) || []).length,
            metaTags: this.pagesMetaTags?.get(url) || {},
         })),
         staticResources: [...this.staticResources].map((url) => ({
            url,
            type: url.split(".").pop().toLowerCase(),
            status: this.statusCodes.get(url) || "unknown",
         })),
      };

      const reportJson = JSON.stringify(report, null, 2);
      fs.writeFileSync("seo-report.json", reportJson);

      // Generuj również raport HTML
      this.generateHtmlReport(report);

      return report;
   }

   analyzeKeywords(text) {
      if (!text) return { found: [], missing: [] };

      const textLower = text.toLowerCase();
      const found = [];
      const missing = [];

      this.keywords.forEach((keyword) => {
         if (textLower.includes(keyword.toLowerCase())) {
            found.push(keyword);
         } else {
            missing.push(keyword);
         }
      });

      return { found, missing };
   }

   generateHtmlReport(report) {
      const htmlReport = `
<!DOCTYPE html>
<html>
<head>
   <meta charset="UTF-8">
   <title>Raport SEO</title>
   <style>
      body {
         font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
         line-height: 1.6;
         color: #333;
         max-width: 1200px;
         margin: 0 auto;
         padding: 20px;
         background: #f5f5f5;
      }
      .container {
         background: white;
         border-radius: 8px;
         box-shadow: 0 2px 4px rgba(0,0,0,0.1);
         padding: 20px;
      }
      .summary {
         margin-bottom: 30px;
         padding: 20px;
         background: #f8f9fa;
         border-radius: 8px;
      }
      .summary h2 {
         margin-top: 0;
         color: #2c3e50;
      }
      .stats {
         display: flex;
         flex-wrap: wrap;
         gap: 20px;
         margin: 15px 0;
      }
      .stat-item {
         background: white;
         padding: 15px;
         border-radius: 6px;
         box-shadow: 0 1px 3px rgba(0,0,0,0.1);
         flex: 1;
         min-width: 200px;
      }
      .stat-label {
         font-size: 0.9em;
         color: #666;
         margin-bottom: 5px;
      }
      .stat-value {
         font-size: 1.2em;
         font-weight: 500;
         color: #2c3e50;
      }
      .page-analysis {
         background: white;
         border-radius: 8px;
         box-shadow: 0 2px 4px rgba(0,0,0,0.1);
         margin-bottom: 30px;
         overflow: hidden;
      }
      .page-header {
         background: #f8f9fa;
         padding: 15px 20px;
         border-bottom: 1px solid #eee;
         display: flex;
         justify-content: space-between;
         align-items: center;
      }
      .page-url {
         font-weight: 500;
         color: #2c3e50;
         word-break: break-all;
      }
      .page-status {
         padding: 4px 8px;
         border-radius: 4px;
         font-size: 0.9em;
      }
      .success {
         background: #d4edda;
         color: #155724;
      }
      .error {
         background: #f8d7da;
         color: #721c24;
      }
      .meta-section {
         padding: 20px;
         border-bottom: 1px solid #eee;
      }
      .meta-section:last-child {
         border-bottom: none;
      }
      .meta-title {
         font-size: 1.1em;
         font-weight: 500;
         color: #2c3e50;
         margin-bottom: 10px;
      }
      .keywords {
         margin: 10px 0;
         font-size: 0.9em;
         color: #666;
      }
      .length-ok {
         color: #28a745;
      }
      .length-warning {
         color: #dc3545;
      }
      .warning {
         color: #dc3545;
         font-weight: 500;
      }
      .ai-suggestions {
         margin-top: 15px;
         padding: 15px;
         background: #e8f4f8;
         border-radius: 6px;
      }
      .ai-suggestions h4 {
         margin: 0 0 10px 0;
         color: #2c3e50;
      }
      .ai-suggestions ul {
         margin: 0;
         padding-left: 20px;
      }
      .ai-suggestions li {
         margin-bottom: 5px;
      }
      .issues {
         margin: 20px 0;
         padding: 15px;
         background: #fff3cd;
         border-radius: 6px;
      }
      .issues h3 {
         margin: 0 0 10px 0;
         color: #856404;
      }
      .issues ul {
         margin: 0;
         padding-left: 20px;
      }
      .issues li {
         margin-bottom: 5px;
         color: #856404;
      }
      @media (max-width: 768px) {
         .stats {
            flex-direction: column;
         }
         .stat-item {
            width: 100%;
         }
      }
   </style>
</head>
<body>
   <div class="container">
      <h1>Raport SEO</h1>
      
      <div class="summary">
         <h2>Podsumowanie</h2>
         <div class="stats">
            <div class="stat-item">
               <div class="stat-label">Liczba przeanalizowanych stron</div>
               <div class="stat-value">${report.pageMeta.length}</div>
            </div>
            <div class="stat-item">
               <div class="stat-label">Średnia długość tytułu</div>
               <div class="stat-value">${Math.round(
                  report.pageMeta.reduce(
                     (acc, page) => acc + page.titleLength,
                     0
                  ) / report.pageMeta.length
               )} znaków</div>
            </div>
            <div class="stat-item">
               <div class="stat-label">Średnia długość opisu</div>
               <div class="stat-value">${Math.round(
                  report.pageMeta.reduce(
                     (acc, page) => acc + page.descriptionLength,
                     0
                  ) / report.pageMeta.length
               )} znaków</div>
            </div>
         </div>
      </div>

      ${
         report.issues && report.issues.length > 0
            ? `
      <div class="issues">
         <h3>Wykryte problemy</h3>
         <ul>
            ${report.issues.map((issue) => `<li>${issue}</li>`).join("")}
         </ul>
      </div>
      `
            : ""
      }

      ${report.pageMeta
         .map((page) => {
            const titleKeywords = this.analyzeKeywords(page.title);
            const descKeywords = this.analyzeKeywords(page.description);
            const titleLengthClass =
               page.titleLength >= 30 && page.titleLength <= 60
                  ? "length-ok"
                  : "length-warning";
            const descLengthClass =
               page.descriptionLength >= 120 && page.descriptionLength <= 160
                  ? "length-ok"
                  : "length-warning";
            const aiSuggestions = page.metaTags?.aiSuggestions;
            const contentAnalysis = page.metaTags?.contentAnalysis;

            return `
         <div class="page-analysis">
            <div class="page-header">
               <div class="page-url">${page.url}</div>
               <span class="page-status ${
                  page.status === 200 ? "success" : "error"
               }">Status: ${page.status}</span>
            </div>

            ${
               contentAnalysis
                  ? `
            <div class="meta-section">
               <div class="meta-title">Analiza treści AI</div>
               <div class="stats">
                  <div class="stat-item">
                     <div class="meta-title">Główne słowa kluczowe</div>
                     <ul>
                        ${contentAnalysis.mainKeywords
                           .map((k) => `<li>${k}</li>`)
                           .join("")}
                     </ul>
                  </div>
                  <div class="stat-item">
                     <div class="meta-title">Słowa kluczowe długiego ogona</div>
                     <ul>
                        ${contentAnalysis.longTailKeywords
                           .map((k) => `<li>${k}</li>`)
                           .join("")}
                     </ul>
                  </div>
               </div>
               <div class="stats">
                  <div class="stat-item">
                     <div class="meta-title">Powiązane tematy</div>
                     <ul>
                        ${contentAnalysis.relatedTopics
                           .map((t) => `<li>${t}</li>`)
                           .join("")}
                     </ul>
                  </div>
               </div>
               <div class="ai-suggestions">
                  <h4>Sugestie struktury treści</h4>
                  <ul>
                     ${contentAnalysis.contentStructure
                        .map((s) => `<li>${s}</li>`)
                        .join("")}
                  </ul>
                  <h4>Sugestie SEO</h4>
                  <ul>
                     ${contentAnalysis.seoSuggestions
                        .map((s) => `<li>${s}</li>`)
                        .join("")}
                  </ul>
               </div>
            </div>
            `
                  : ""
            }

            <div class="meta-section">
               <div class="meta-title">Tytuł strony</div>
               <div>${
                  page.title || '<span class="warning">Brak tytułu</span>'
               }</div>
               <div class="keywords">
                  <div>Znalezione słowa kluczowe: ${
                     titleKeywords.found.join(", ") || "brak"
                  }</div>
                  ${
                     titleKeywords.missing.length > 0
                        ? `<div>Brakujące słowa kluczowe: ${titleKeywords.missing
                             .slice(0, 3)
                             .join(", ")}${
                             titleKeywords.missing.length > 3 ? "..." : ""
                          }</div>`
                        : ""
                  }
               </div>
               <div class="stats">
                  <div class="stat-item">
                     <div class="stat-label">Długość tytułu</div>
                     <div class="stat-value ${titleLengthClass}">${
               page.titleLength
            } znaków</div>
                  </div>
                  <div class="stat-item">
                     <div class="stat-label">Słowa kluczowe w tytule</div>
                     <div class="stat-value">${titleKeywords.found.length}/${
               this.keywords.size
            } (${Math.round(
               (titleKeywords.found.length / this.keywords.size) * 100
            )}%)</div>
                  </div>
               </div>
               ${
                  aiSuggestions
                     ? `
               <div class="ai-suggestions">
                  <h4>Sugestie AI</h4>
                  <p><strong>Zoptymalizowany tytuł:</strong> ${aiSuggestions.optimizedTitle}</p>
               </div>
               `
                     : ""
               }
            </div>

            <div class="meta-section">
               <div class="meta-title">Meta opis</div>
               <div>${
                  page.description || '<span class="warning">Brak opisu</span>'
               }</div>
               <div class="keywords">
                  <div>Znalezione słowa kluczowe: ${
                     descKeywords.found.join(", ") || "brak"
                  }</div>
                  ${
                     descKeywords.missing.length > 0
                        ? `<div>Brakujące słowa kluczowe: ${descKeywords.missing
                             .slice(0, 3)
                             .join(", ")}${
                             descKeywords.missing.length > 3 ? "..." : ""
                          }</div>`
                        : ""
                  }
               </div>
               <div class="stats">
                  <div class="stat-item">
                     <div class="stat-label">Długość opisu</div>
                     <div class="stat-value ${descLengthClass}">${
               page.descriptionLength
            } znaków</div>
                  </div>
                  <div class="stat-item">
                     <div class="stat-label">Słowa kluczowe w opisie</div>
                     <div class="stat-value">${descKeywords.found.length}/${
               this.keywords.size
            } (${Math.round(
               (descKeywords.found.length / this.keywords.size) * 100
            )}%)</div>
                  </div>
               </div>
               ${
                  aiSuggestions
                     ? `
               <div class="ai-suggestions">
                  <h4>Sugestie AI</h4>
                  <p><strong>Zoptymalizowany opis:</strong> ${aiSuggestions.optimizedDescription}</p>
               </div>
               `
                     : ""
               }
            </div>

            <div class="meta-section">
               <div class="meta-title">Statystyki strony</div>
               <div class="stats">
                  <div class="stat-item">
                     <div class="stat-label">Linki wewnętrzne</div>
                     <div class="stat-value">${page.internalLinksCount}</div>
                  </div>
                  <div class="stat-item">
                     <div class="stat-label">Linki zewnętrzne</div>
                     <div class="stat-value">${page.externalLinksCount}</div>
                  </div>
               </div>
            </div>
         </div>`;
         })
         .join("")}
   </div>
</body>
</html>
      `;

      fs.writeFileSync("seo-report.html", htmlReport);
   }

   async generatePdfReport() {
      try {
         console.log("Generowanie raportu PDF...");
         const browser = await puppeteer.launch();
         const page = await browser.newPage();

         // Wczytaj wygenerowany raport HTML
         const htmlContent = fs.readFileSync("seo-report.html", "utf8");
         await page.setContent(htmlContent, {
            waitUntil: "networkidle0",
         });

         // Generuj PDF
         await page.pdf({
            path: "seo-report.pdf",
            format: "A4",
            printBackground: true,
            margin: {
               top: "20px",
               right: "20px",
               bottom: "20px",
               left: "20px",
            },
         });

         await browser.close();
         console.log("Raport PDF został wygenerowany: seo-report.pdf");
      } catch (error) {
         console.error(`Błąd podczas generowania PDF: ${error.message}`);
      }
   }

   async analyze(maxDepth = 10) {
      console.log(`Rozpoczynam analizę SEO dla: ${this.startUrl}`);

      // Krok 1: Crawlowanie strony
      console.log("Rozpoczynam crawlowanie...");
      await this.crawl(this.startUrl, 0, maxDepth);
      console.log(
         `Zakończono crawlowanie, odwiedzono ${this.visitedUrls.size} stron`
      );

      // Zbieranie problemów
      const issues = [];
      
      // Sprawdzanie tytułów
      for (const [url, title] of this.pagesTitles.entries()) {
         if (!title) {
            issues.push(`Brak tytułu na stronie: ${url}`);
         } else if (title.length < 30 || title.length > 60) {
            issues.push(`Nieprawidłowa długość tytułu (${title.length} znaków) na stronie: ${url}`);
         }
      }

      // Sprawdzanie opisów
      for (const [url, description] of this.pagesDescriptions.entries()) {
         if (!description) {
            issues.push(`Brak meta opisu na stronie: ${url}`);
         } else if (description.length < 120 || description.length > 160) {
            issues.push(`Nieprawidłowa długość meta opisu (${description.length} znaków) na stronie: ${url}`);
         }
      }

      // Sprawdzanie nagłówków H1
      for (const [url, h1] of this.pagesH1.entries()) {
         if (!h1) {
            issues.push(`Brak nagłówka H1 na stronie: ${url}`);
         }
      }

      // Sprawdzanie uszkodzonych linków
      if (this.brokenLinks.length > 0) {
         issues.push(`Znaleziono ${this.brokenLinks.length} uszkodzonych linków`);
      }

      // Sprawdzanie sitemap
      if (this.urlsNotInSitemap.size > 0) {
         issues.push(`${this.urlsNotInSitemap.size} stron nie jest w sitemap`);
      }
      if (this.urlsInSitemapButNotCrawled.size > 0) {
         issues.push(`${this.urlsInSitemapButNotCrawled.size} stron z sitemap nie zostało scrawlowanych`);
      }

      // Krok 2: Pobranie i analiza sitemap
      const sitemapXml = await this.fetchSitemap();
      if (sitemapXml) {
         try {
            await this.parseSitemap(sitemapXml);
            console.log(
               `Przetworzono sitemap, znaleziono ${this.sitemapUrls.size} URL-i`
            );
         } catch (error) {
            console.error(
               `Błąd podczas przetwarzania sitemap: ${error.message}`
            );
         }
      }

      // Krok 3: Porównanie wyników crawlowania z sitemap
      this.compareCrawlWithSitemap();

      // Krok 4: Generowanie raportu
      console.log("Generowanie raportu...");
      const report = this.generateReport();
      report.issues = issues; // Dodajemy zebrane problemy do raportu
      console.log(
         `Raport został wygenerowany. Zapisano do: seo-report.json i seo-report.html`
      );

      // Krok 5: Generowanie PDF
      await this.generatePdfReport();

      return report;
   }
}

// Funkcja do uruchomienia analizy
async function runAnalysis(url, maxDepth = 10) {
   try {
      console.log(`=== Analizator SEO ===`);
      console.log(`URL: ${url}`);
      console.log(`Maksymalna głębokość: ${maxDepth}`);
      console.log(`===================\n`);

      const openaiApiKey = process.env.OPENAI_API_KEY;
      if (!openaiApiKey) {
         console.error(
            "Błąd: Brak klucza API OpenAI. Upewnij się, że plik .env zawiera OPENAI_API_KEY"
         );
         process.exit(1);
      }

      const analyzer = new SEOAnalyzer(url, openaiApiKey);
      await analyzer.analyze(maxDepth);

      console.log(`\n=== Analiza zakończona ===`);
      console.log(
         `Sprawdź pliki seo-report.json i seo-report.html, aby zobaczyć szczegółowy raport.`
      );
   } catch (error) {
      console.error(`Wystąpił błąd podczas analizy: ${error.message}`);
   }
}

// Uruchomienie analizy z parametrami z wiersza poleceń
if (require.main === module) {
   const args = process.argv.slice(2);

   if (args.length === 0) {
      console.error("Proszę podać URL strony do analizy");
      process.exit(1);
   }

   const url = args[0];
   const maxDepth = args.length > 1 ? parseInt(args[1], 10) : 10;

   runAnalysis(url, maxDepth);
}

module.exports = {
   SEOAnalyzer,
   runAnalysis,
};
