const OpenAI = require("openai");

class SEOAIOptimizer {
   constructor(apiKey) {
      this.openai = new OpenAI({
         apiKey: apiKey,
      });
   }

   // Funkcja pomocnicza do czyszczenia i walidacji odpowiedzi JSON
   cleanAndParseJSON(text) {
      try {
         // Usuń wszystkie znaki przed pierwszym {
         const startIndex = text.indexOf('{');
         if (startIndex === -1) {
            throw new Error('Nie znaleziono początku obiektu JSON');
         }
         const cleanedText = text.slice(startIndex);

         // Usuń wszystkie znaki po ostatnim }
         const endIndex = cleanedText.lastIndexOf('}');
         if (endIndex === -1) {
            throw new Error('Nie znaleziono końca obiektu JSON');
         }
         const finalText = cleanedText.slice(0, endIndex + 1);

         return JSON.parse(finalText);
      } catch (error) {
         console.error('Błąd podczas czyszczenia i parsowania JSON:', error);
         throw error;
      }
   }

   async optimizeTitle(currentTitle, keywords, maxLength = 60) {
      try {
         const response = await this.openai.responses.create({
            model: "gpt-4o-mini",
            input: [
               {
                  "role": "system",
                  "content": [
                     {
                        "type": "input_text",
                        "text": `Zoptymalizuj poniższy tytuł strony pod kątem SEO, uwzględniając następujące słowa kluczowe: ${keywords.join(", ")}. 
                        Tytuł powinien być naturalny, przyciągający uwagę i zawierać najważniejsze słowa kluczowe. Maksymalna długość: ${maxLength} znaków.
                        Obecny tytuł: "${currentTitle}"
                        Odpowiedź musi być w formacie JSON:
                        {
                           "optimizedTitle": "optymalizowany tytuł"
                        } nie zwracaj niczego innego`
                     }
                  ]
               }
            ],
            text: {
               "format": {
                  "type": "json_object"
               }
            },
            reasoning: {},
            tools: [],
            temperature: 1,
            max_output_tokens: 2048,
            top_p: 1,
            store: false
         });

         console.log("Odpowiedź z API (tytuł):", response.output_text);

         if (!response || !response.output_text) {
            console.error("Nieprawidłowa odpowiedź z API OpenAI podczas optymalizacji tytułu");
            return currentTitle;
         }

         try {
            const parsedResponse = this.cleanAndParseJSON(response.output_text);
            return parsedResponse.optimizedTitle || currentTitle;
         } catch (parseError) {
            console.error("Błąd podczas parsowania odpowiedzi JSON dla tytułu:", parseError);
            return currentTitle;
         }
      } catch (error) {
         console.error("Błąd podczas optymalizacji tytułu:", error);
         return currentTitle;
      }
   }

   async optimizeDescription(currentDescription, keywords, maxLength = 160) {
      try {
         const response = await this.openai.responses.create({
            model: "gpt-4o-mini",
            input: [
               {
                  "role": "system",
                  "content": [
                     {
                        "type": "input_text",
                        "text": `Zoptymalizuj poniższy opis strony pod kątem SEO, uwzględniając następujące słowa kluczowe: ${keywords.join(", ")}. 
                        Opis powinien być naturalny, zachęcający do kliknięcia i zawierać najważniejsze słowa kluczowe. Maksymalna długość: ${maxLength} znaków.
                        Obecny opis: "${currentDescription}"
                        Odpowiedź musi być w formacie JSON:
                        {
                           "optimizedDescription": "optymalizowany opis"
                        } nie zwracaj niczego innego`
                     }
                  ]
               }
            ],
            text: {
               "format": {
                  "type": "json_object"
               }
            },
            reasoning: {},
            tools: [],
            temperature: 0.7,
            max_output_tokens: 200,
            top_p: 1,
            store: false
         });

         console.log("Odpowiedź z API (opis):", response.output_text);

         if (!response || !response.output_text) {
            console.error("Nieprawidłowa odpowiedź z API OpenAI podczas optymalizacji opisu");
            return currentDescription;
         }

         try {
            const parsedResponse = this.cleanAndParseJSON(response.output_text);
            return parsedResponse.optimizedDescription || currentDescription;
         } catch (parseError) {
            console.error("Błąd podczas parsowania odpowiedzi JSON dla opisu:", parseError);
            return currentDescription;
         }
      } catch (error) {
         console.error("Błąd podczas optymalizacji opisu:", error);
         return currentDescription;
      }
   }

   async analyzeContent(content, keywords) {
      try {
         const response = await this.openai.responses.create({
            model: "gpt-4o-mini",
            input: [
               {
                  "role": "system",
                  "content": [
                     {
                        "type": "input_text",
                        "text": `Przeanalizuj poniższą treść pod kątem SEO i zaproponuj ulepszenia:
                        Treść: "${content}"
                        Słowa kluczowe: ${keywords.join(", ")}
                        
                        Przeanalizuj:
                        1. Gęstość słów kluczowych
                        2. Naturalność tekstu
                        3. Strukturę i czytelność
                        4. Potencjalne ulepszenia
                        Odpowiedź musi być w formacie JSON:
                        {
                           "suggestions": ["słowo1", "słowo2", "słowo3"]
                        } nie zwracaj niczego innego`
                     }
                  ]
               }
            ],
            text: {
               "format": {
                  "type": "json_object"
               }
            },
            reasoning: {},
            tools: [],
            temperature: 0.7,
            max_output_tokens: 300,
            top_p: 1,
            store: false
         });

         console.log("Odpowiedź z API (analiza treści):", response.output_text);

         if (!response || !response.output_text) {
            console.error("Nieprawidłowa odpowiedź z API OpenAI podczas analizy treści");
            return null;
         }

         try {
            const parsedResponse = this.cleanAndParseJSON(response.output_text);
            return parsedResponse.suggestions || [];
         } catch (parseError) {
            console.error("Błąd podczas parsowania odpowiedzi JSON dla analizy treści:", parseError);
            return null;
         }
      } catch (error) {
         console.error("Błąd podczas analizy treści:", error);
         return null;
      }
   }

   async generateKeywordSuggestions(currentKeywords, industry = "hydraulika") {
      try {
         const response = await this.openai.responses.create({
            model: "gpt-4o-mini",
            input: [
               {
                  "role": "system",
                  "content": [
                     {
                        "type": "input_text",
                        "text": `Zaproponuj dodatkowe słowa kluczowe związane z branżą ${industry}, które mogłyby uzupełnić obecną listę: ${currentKeywords.join(", ")}.
                        Uwzględnij:
                        1. Frazy długiego ogona
                        2. Synonimy
                        3. Powiązane usługi
                        4. Lokalne słowa kluczowe
                        Odpowiedź musi być w formacie JSON:
                        {
                           "suggestions": ["słowo1", "słowo2", "słowo3"]
                        } nie zwracaj niczego innego`
                     }
                  ]
               }
            ],
            text: {
               "format": {
                  "type": "json_object"
               }
            },
            reasoning: {},
            tools: [],
            temperature: 0.7,
            max_output_tokens: 2048,
            top_p: 1,
            store: false
         });

         console.log("Odpowiedź z API (sugestie słów kluczowych):", response.output_text);

         if (!response || !response.output_text) {
            console.error("Nieprawidłowa odpowiedź z API OpenAI podczas generowania sugestii słów kluczowych");
            return currentKeywords;
         }

         try {
            const parsedResponse = this.cleanAndParseJSON(response.output_text);
            return parsedResponse.suggestions || currentKeywords;
         } catch (parseError) {
            console.error("Błąd podczas parsowania odpowiedzi JSON dla sugestii słów kluczowych:", parseError);
            return currentKeywords;
         }
      } catch (error) {
         console.error("Błąd podczas generowania sugestii słów kluczowych:", error);
         return currentKeywords;
      }
   }

   async optimizeMetaTags(pageData) {
      try {
         const optimizedData = {
            title: await this.optimizeTitle(pageData.title, pageData.keywords),
            description: await this.optimizeDescription(
               pageData.description,
               pageData.keywords
            ),
            suggestions: await this.generateKeywordSuggestions(
               pageData.keywords
            ),
         };

         return optimizedData;
      } catch (error) {
         console.error("Błąd podczas optymalizacji meta tagów:", error);
         return pageData;
      }
   }

   async analyzePageContent(content, url) {
      try {
         console.log("Rozpoczynam analizę treści dla URL:", url);
         console.log("Długość treści:", content.length);

         const response = await this.openai.responses.create({
            model: "gpt-4o-mini",
            input: [
               {
                  "role": "system",
                  "content": [
                     {
                        "type": "input_text",
                        "text": `Przeanalizuj poniższą treść strony i wygeneruj:
                           1. Listę głównych słów kluczowych (max 10)
                           2. Listę długiego ogona (max 15)
                           3. Listę powiązanych tematów (max 10)
                           4. Sugestie dotyczące struktury treści
                           5. Sugestie dotyczące optymalizacji pod SEO

                           Treść strony:
                           ${content}

                           URL: ${url}

                           Twoja odpowiedź musi być w formacie JSON o następującym formatowaniu:
                           {
                           "mainKeywords": [],
                           "longTailKeywords": [],
                           "relatedTopics": [],
                           "contentStructure": [],
                           "seoSuggestions": []
                           } zwróć tylko JSON`
                     }
                  ]
               }
            ],
            text: {
               "format": {
                  "type": "json_object"
               }
            },
            reasoning: {},
            tools: [],
            temperature: 1,
            max_output_tokens: 2048,
            top_p: 1,
            store: false
         });

         console.log("Odpowiedź z API (analiza treści):", response.output_text);

         if (!response || !response.output_text) {
            console.error("Nieprawidłowa odpowiedź z API OpenAI podczas analizy treści");
            return {
               mainKeywords: [],
               longTailKeywords: [],
               relatedTopics: [],
               contentStructure: [],
               seoSuggestions: []
            };
         }

         try {
            const parsedResponse = this.cleanAndParseJSON(response.output_text);
            console.log("Sparsowana odpowiedź:", parsedResponse);

            // Sprawdź, czy wszystkie wymagane pola są obecne
            const requiredFields = ['mainKeywords', 'longTailKeywords', 'relatedTopics', 'contentStructure', 'seoSuggestions'];
            const missingFields = requiredFields.filter(field => !parsedResponse[field]);

            if (missingFields.length > 0) {
               console.error("Brakujące pola w odpowiedzi:", missingFields);
               // Uzupełnij brakujące pola pustymi tablicami
               missingFields.forEach(field => {
                  parsedResponse[field] = [];
               });
            }

            // Upewnij się, że wszystkie pola są tablicami
            requiredFields.forEach(field => {
               if (!Array.isArray(parsedResponse[field])) {
                  console.error(`Pole ${field} nie jest tablicą, konwertuję na tablicę`);
                  parsedResponse[field] = [];
               }
            });

            return parsedResponse;
         } catch (parseError) {
            console.error("Błąd podczas parsowania odpowiedzi JSON dla analizy treści:", parseError);
            return {
               mainKeywords: [],
               longTailKeywords: [],
               relatedTopics: [],
               contentStructure: [],
               seoSuggestions: []
            };
         }
      } catch (error) {
         console.error("Błąd podczas analizy treści:", error);
         return {
            mainKeywords: [],
            longTailKeywords: [],
            relatedTopics: [],
            contentStructure: [],
            seoSuggestions: []
         };
      }
   }
}

module.exports = SEOAIOptimizer;
