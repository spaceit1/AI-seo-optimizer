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
const SEOAIOptimizer = require('./seo-ai-optimizer');
const config = require('./config');
require('dotenv').config();

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
      // Ignoruj pliki statyczne i inne zasoby nieprzydatne do crawlowania
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
         ".eot"
      ];
      
      const isStaticResource = ignoreExtensions.some((ext) => url.toLowerCase().endsWith(ext));
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
            this.pagesDescriptionsWarnings = this.pagesDescriptionsWarnings || new Map();
            this.pagesDescriptionsWarnings.set(url, description.length);
         }
      }

      // Pobierz wszystkie meta tagi
      const metaTags = {};
      $('meta').each((_, element) => {
         const name = $(element).attr('name') || $(element).attr('property');
         const content = $(element).attr('content');
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
               title: title || '',
               description: description || '',
               keywords: Array.from(this.keywords)
            };

            const optimizedData = await this.aiOptimizer.optimizeMetaTags(pageData);
            
            // Dodaj sugestie optymalizacji do raportu
            this.pagesMetaTags.get(url).aiSuggestions = {
               optimizedTitle: optimizedData.title,
               optimizedDescription: optimizedData.description,
               keywordSuggestions: optimizedData.suggestions
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
      await this.extractMetadata($, url);
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
            urlsWithInvalidTitleLength: this.pagesTitlesWarnings ? [...this.pagesTitlesWarnings.entries()] : [],
            urlsWithInvalidDescriptionLength: this.pagesDescriptionsWarnings ? [...this.pagesDescriptionsWarnings.entries()] : [],
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
         staticResources: [...this.staticResources].map(url => ({
            url,
            type: url.split('.').pop().toLowerCase(),
            status: this.statusCodes.get(url) || "unknown"
         }))
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
      
      this.keywords.forEach(keyword => {
         if (textLower.includes(keyword.toLowerCase())) {
            found.push(keyword);
         } else {
            missing.push(keyword);
         }
      });
      
      return { found, missing };
   }

   generateHtmlReport(report) {
      const title = `Raport SEO dla ${report.baseUrl}`;
      const htmlReport = `
<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #333; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #2c3e50; }
    h2 { color: #3498db; margin-top: 30px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background-color: #f2f2f2; position: sticky; top: 0; }
    tr:hover { background-color: #f5f5f5; }
    .error { color: #e74c3c; }
    .warning { color: #f39c12; }
    .success { color: #27ae60; }
    .summary { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    .issues ul { margin-top: 5px; }
    .section { margin-bottom: 40px; }
    .keywords { font-size: 0.9em; }
    .keywords .found { color: #27ae60; }
    .keywords .missing { color: #e74c3c; }
    .length-warning { color: #e74c3c; }
    .length-ok { color: #27ae60; }
    .page-details { margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 5px; }
    .page-details h3 { margin-top: 0; color: #2c3e50; }
    .page-details p { margin: 5px 0; }
    .table-container { overflow-x: auto; }
    .ai-suggestions { 
      background-color: #e8f4f8; 
      padding: 10px; 
      margin-top: 10px; 
      border-radius: 5px; 
    }
    .ai-suggestions h4 { 
      color: #2980b9; 
      margin: 0 0 10px 0; 
    }
    .ai-suggestions ul { 
      margin: 0; 
      padding-left: 20px; 
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${title}</h1>
    <p>Raport wygenerowany: ${new Date().toLocaleString()}</p>
    
    <div class="summary">
      <h2>Podsumowanie</h2>
      <p>Przeanalizowano <strong>${report.crawlStats.totalUrlsCrawled}</strong> stron.</p>
      <p>Znaleziono <strong>${report.crawlStats.totalStaticResources}</strong> zasobów statycznych.</p>
      <p>W pliku sitemap.xml znaleziono <strong>${report.sitemapStats.totalUrlsInSitemap}</strong> adresów URL.</p>
      <p class="${report.crawlStats.brokenLinks > 0 ? "error" : "success"}">
        Znaleziono <strong>${report.crawlStats.brokenLinks}</strong> uszkodzonych linków.
      </p>
    </div>
    
    <div class="issues">
      <h2>Problemy</h2>
      <ul>
        ${report.crawlStats.brokenLinks > 0 ? `<li class="error">Uszkodzone linki: ${report.crawlStats.brokenLinks}</li>` : ""}
        ${report.crawlStats.urlsWithoutTitle.length > 0 ? `<li class="warning">Strony bez tytułu: ${report.crawlStats.urlsWithoutTitle.length}</li>` : ""}
        ${report.crawlStats.urlsWithoutDescription.length > 0 ? `<li class="warning">Strony bez opisu: ${report.crawlStats.urlsWithoutDescription.length}</li>` : ""}
        ${report.crawlStats.urlsWithoutH1.length > 0 ? `<li class="warning">Strony bez nagłówka H1: ${report.crawlStats.urlsWithoutH1.length}</li>` : ""}
        ${report.sitemapStats.urlsNotInSitemap.length > 0 ? `<li class="warning">Strony brakujące w sitemap: ${report.sitemapStats.urlsNotInSitemap.length}</li>` : ""}
      </ul>
    </div>
    
    <div class="section">
      <h2>Analiza stron</h2>
      <div class="table-container">
        <table>
          <tr>
            <th>URL</th>
            <th>Status</th>
            <th>Tytuł</th>
            <th>Długość tytułu</th>
            <th>Opis</th>
            <th>Długość opisu</th>
            <th>Linki wewnętrzne</th>
            <th>Linki zewnętrzne</th>
          </tr>
          ${report.pageMeta
            .map(page => {
              const titleKeywords = this.analyzeKeywords(page.title);
              const descKeywords = this.analyzeKeywords(page.description);
              const titleLengthClass = page.titleLength >= 30 && page.titleLength <= 60 ? "length-ok" : "length-warning";
              const descLengthClass = page.descriptionLength >= 120 && page.descriptionLength <= 160 ? "length-ok" : "length-warning";
              const aiSuggestions = page.metaTags?.aiSuggestions;
              
              return `
          <tr>
            <td>${page.url}</td>
            <td class="${page.status === 200 ? "success" : "error"}">${page.status}</td>
            <td>
              ${page.title || '<span class="warning">Brak</span>'}
              <div class="keywords">
                <span class="found">Znalezione: ${titleKeywords.found.join(", ")}</span>
                ${titleKeywords.missing.length > 0 ? `<br><span class="missing">Brakuje: ${titleKeywords.missing.slice(0, 3).join(", ")}${titleKeywords.missing.length > 3 ? "..." : ""}</span>` : ""}
              </div>
              ${aiSuggestions ? `
              <div class="ai-suggestions">
                <h4>Sugestie AI:</h4>
                <p><strong>Zoptymalizowany tytuł:</strong> ${aiSuggestions.optimizedTitle}</p>
                <p><strong>Dodatkowe słowa kluczowe:</strong></p>
                <ul>
                  ${aiSuggestions.keywordSuggestions.slice(0, 5).map(k => `<li>${k}</li>`).join('')}
                </ul>
              </div>
              ` : ''}
            </td>
            <td class="${titleLengthClass}">${page.titleLength}</td>
            <td>
              ${page.description || '<span class="warning">Brak</span>'}
              <div class="keywords">
                <span class="found">Znalezione: ${descKeywords.found.join(", ")}</span>
                ${descKeywords.missing.length > 0 ? `<br><span class="missing">Brakuje: ${descKeywords.missing.slice(0, 3).join(", ")}${descKeywords.missing.length > 3 ? "..." : ""}</span>` : ""}
              </div>
              ${aiSuggestions ? `
              <div class="ai-suggestions">
                <h4>Sugestie AI:</h4>
                <p><strong>Zoptymalizowany opis:</strong> ${aiSuggestions.optimizedDescription}</p>
              </div>
              ` : ''}
            </td>
            <td class="${descLengthClass}">${page.descriptionLength}</td>
            <td>${page.internalLinksCount}</td>
            <td>${page.externalLinksCount}</td>
          </tr>
          <tr>
            <td colspan="8">
              <div class="page-details">
                <h3>Szczegółowa analiza</h3>
                <p><strong>Długość tytułu:</strong> <span class="${titleLengthClass}">${page.titleLength} znaków</span> ${page.titleLength < 30 ? "(za krótki)" : page.titleLength > 60 ? "(za długi)" : "(optymalna)"}</p>
                <p><strong>Długość opisu:</strong> <span class="${descLengthClass}">${page.descriptionLength} znaków</span> ${page.descriptionLength < 120 ? "(za krótki)" : page.descriptionLength > 160 ? "(za długi)" : "(optymalna)"}</p>
                <p><strong>Słowa kluczowe w tytule:</strong> ${titleKeywords.found.length}/${this.keywords.size} (${Math.round(titleKeywords.found.length/this.keywords.size*100)}%)</p>
                <p><strong>Słowa kluczowe w opisie:</strong> ${descKeywords.found.length}/${this.keywords.size} (${Math.round(descKeywords.found.length/this.keywords.size*100)}%)</p>
              </div>
            </td>
          </tr>`;
            })
            .join("")}
        </table>
      </div>
    </div>
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
            waitUntil: "networkidle0"
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
               left: "20px"
            }
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
         console.error("Błąd: Brak klucza API OpenAI. Upewnij się, że plik .env zawiera OPENAI_API_KEY");
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
