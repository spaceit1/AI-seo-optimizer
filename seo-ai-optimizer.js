const OpenAI = require('openai');

class SEOAIOptimizer {
    constructor(apiKey) {
        this.openai = new OpenAI({
            apiKey: apiKey
        });
    }

    async optimizeTitle(currentTitle, keywords, maxLength = 60) {
        try {
            const prompt = `Zoptymalizuj poniższy tytuł strony pod kątem SEO, uwzględniając następujące słowa kluczowe: ${keywords.join(', ')}. 
            Tytuł powinien być naturalny, przyciągający uwagę i zawierać najważniejsze słowa kluczowe. Maksymalna długość: ${maxLength} znaków.
            Obecny tytuł: "${currentTitle}"`;

            const response = await this.openai.completions.create({
                model: "gpt-4o-mini",
                prompt: prompt,
                max_tokens: 100,
                temperature: 0.7
            });

            return response.choices[0].text.trim();
        } catch (error) {
            console.error('Błąd podczas optymalizacji tytułu:', error);
            return currentTitle;
        }
    }

    async optimizeDescription(currentDescription, keywords, maxLength = 160) {
        try {
            const prompt = `Zoptymalizuj poniższy opis strony pod kątem SEO, uwzględniając następujące słowa kluczowe: ${keywords.join(', ')}. 
            Opis powinien być naturalny, zachęcający do kliknięcia i zawierać najważniejsze słowa kluczowe. Maksymalna długość: ${maxLength} znaków.
            Obecny opis: "${currentDescription}"`;

            const response = await this.openai.completions.create({
                model: "gpt-4o-mini",
                prompt: prompt,
                max_tokens: 200,
                temperature: 0.7
            });

            return response.choices[0].text.trim();
        } catch (error) {
            console.error('Błąd podczas optymalizacji opisu:', error);
            return currentDescription;
        }
    }

    async analyzeContent(content, keywords) {
        try {
            const prompt = `Przeanalizuj poniższą treść pod kątem SEO i zaproponuj ulepszenia:
            Treść: "${content}"
            Słowa kluczowe: ${keywords.join(', ')}
            
            Przeanalizuj:
            1. Gęstość słów kluczowych
            2. Naturalność tekstu
            3. Strukturę i czytelność
            4. Potencjalne ulepszenia`;

            const response = await this.openai.completions.create({
                model: "gpt-4o-mini",
                prompt: prompt,
                max_tokens: 300,
                temperature: 0.7
            });

            return response.choices[0].text.trim();
        } catch (error) {
            console.error('Błąd podczas analizy treści:', error);
            return null;
        }
    }

    async generateKeywordSuggestions(currentKeywords, industry = 'hydraulika') {
        try {
            const prompt = `Zaproponuj dodatkowe słowa kluczowe związane z branżą ${industry}, które mogłyby uzupełnić obecną listę: ${currentKeywords.join(', ')}.
            Uwzględnij:
            1. Frazy długiego ogona
            2. Synonimy
            3. Powiązane usługi
            4. Lokalne słowa kluczowe`;

            const response = await this.openai.completions.create({
                model: "gpt-4o-mini",
                prompt: prompt,
                max_tokens: 200,
                temperature: 0.7
            });

            return response.choices[0].text.trim().split(',').map(k => k.trim());
        } catch (error) {
            console.error('Błąd podczas generowania sugestii słów kluczowych:', error);
            return currentKeywords;
        }
    }

    async optimizeMetaTags(pageData) {
        try {
            const optimizedData = {
                title: await this.optimizeTitle(pageData.title, pageData.keywords),
                description: await this.optimizeDescription(pageData.description, pageData.keywords),
                suggestions: await this.generateKeywordSuggestions(pageData.keywords)
            };

            return optimizedData;
        } catch (error) {
            console.error('Błąd podczas optymalizacji meta tagów:', error);
            return pageData;
        }
    }
}

module.exports = SEOAIOptimizer; 